/**
 * Applies an Excel export plan to the client's template at the XML level
 * (EXP-02): the mapped input cells are written and nothing else in the
 * template changes. Sheet copies (one per segment) are exact copies of the
 * master's XML, and external links, protected ranges, data validation, named
 * ranges, custom XML and document properties all pass through untouched.
 * Excel is asked to recalculate on opening, as the formulas' cached results
 * predate the new inputs.
 */
import type { CellValue, ExcelPlan, ExtraSheet } from '@/domain/export/excel-plan';
import { FormulaCellError, newSheetXml, writeCells, type XlsxCellWrite } from '@/lib/xlsx/cells';
import {
  CONTENT_TYPES,
  REL_TYPES,
  XlsxPackage,
  attributes,
  escapeXml,
  relativeTarget,
  relsPartOf,
  resolveTarget,
  setAttribute,
  type Relationship,
} from '@/lib/xlsx/package';
import { TemplateError } from './excel-writer';

interface SheetEntry {
  /** The `<sheet …/>` element as written in workbook.xml. */
  tag: string;
  name: string;
  part: string;
  /** Position in the template, or null for a sheet added here. */
  originalIndex: number | null;
}

/** Parts a copied sheet may not share with its source; tables and pivots are left out. */
const DROPPED_ON_COPY = new Set<string>([REL_TYPES.table, REL_TYPES.pivotTable]);

function newGuid(): string {
  const hex = crypto.randomUUID().toUpperCase();
  return `{${hex}}`;
}

class WorkbookEditor {
  readonly pkg: XlsxPackage;
  readonly workbookPart: string;
  xml: string;
  sheets: SheetEntry[];
  private readonly originalActive: number;
  private lastSheetId: number;

  constructor(pkg: XlsxPackage) {
    this.pkg = pkg;
    this.workbookPart = pkg.workbookPart();
    this.xml = pkg.read(this.workbookPart);
    const rels = new Map(pkg.relationships(this.workbookPart).map((r) => [r.id, r]));
    const sheetsXml = /<sheets\b[^>]*>([\s\S]*?)<\/sheets>/.exec(this.xml)?.[1] ?? '';
    this.sheets = [...sheetsXml.matchAll(/<sheet\b[^>]*\/?>/g)].map((m, i) => {
      const a = attributes(m[0]);
      const rel = rels.get(a.get('r:id') ?? '');
      return {
        tag: m[0],
        name: a.get('name') ?? '',
        part: rel ? resolveTarget(this.workbookPart, rel.target) : '',
        originalIndex: i,
      };
    });
    this.lastSheetId = Math.max(
      0,
      ...this.sheets.map((s) => Number(attributes(s.tag).get('sheetId') ?? 0)),
    );
    const view = /<workbookView\b[^>]*>/.exec(this.xml)?.[0];
    this.originalActive = Number(view ? (attributes(view).get('activeTab') ?? 0) : 0);
  }

  sheet(name: string): SheetEntry {
    const found = this.sheets.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!found || !this.pkg.has(found.part)) throw new TemplateError('missingSheet', name);
    return found;
  }

  /** A new sheet element and relationship for a part; the entry is not placed yet. */
  private register(name: string, part: string): SheetEntry {
    const id = this.pkg.addRelationship(this.workbookPart, REL_TYPES.worksheet, part);
    this.pkg.setContentTypeOverride(part, CONTENT_TYPES.worksheet);
    return {
      tag: `<sheet name="${escapeXml(name)}" sheetId="${(this.lastSheetId += 1)}" r:id="${id}"/>`,
      name,
      part,
      originalIndex: null,
    };
  }

  /** Copies a part and the parts it owns; images and external targets are shared. */
  private copyPart(part: string, copied: Map<string, string>): string {
    const done = copied.get(part);
    if (done) return done;
    const m = /^(.*\/)?([^/]*?)(\d*)(\.[^./]+)$/.exec(part)!;
    const name = this.pkg.freeName(m[1] ?? '', m[2]!, m[4]!);
    copied.set(part, name);
    this.pkg.write(name, this.pkg.bytes(part));
    const type = this.pkg.contentTypeOverride(part);
    if (type) this.pkg.setContentTypeOverride(name, type);
    const rels = this.pkg.relationships(part);
    if (rels.length) {
      this.pkg.setRelationships(
        name,
        rels.map((r) =>
          r.external || r.type === REL_TYPES.image
            ? r
            : {
                ...r,
                target: relativeTarget(name, this.copyPart(resolveTarget(part, r.target), copied)),
              },
        ),
      );
    }
    return name;
  }

  /** Copies a sheet under a new name, placed after `after` (or the source). */
  copySheet(sourceName: string, name: string, after: SheetEntry): SheetEntry {
    const source = this.sheet(sourceName);
    const part = this.pkg.freeName('xl/worksheets/', 'sheet', '.xml');
    let xml = this.pkg.read(source.part);
    // One selected tab per workbook, unique revision ids, and a code name Excel assigns.
    xml = xml.replace(/<sheetView\b[^>]*>/g, (tag) => setAttribute(tag, 'tabSelected', null));
    xml = xml.replace(
      /(\sxr\d*:uid=")\{[0-9A-Fa-f-]+\}(")/g,
      (_, a: string, b: string) => `${a}${newGuid()}${b}`,
    );
    xml = xml.replace(/<sheetPr\b[^>]*>/, (tag) => setAttribute(tag, 'codeName', null));
    const rels = this.pkg.relationships(source.part);
    if (rels.some((r) => r.type === REL_TYPES.table)) {
      // Table names are unique in a workbook, so a copy has no tables.
      xml = xml.replace(/<tableParts\b[^>]*\/>|<tableParts\b[^>]*>[\s\S]*?<\/tableParts>/g, '');
    }
    this.pkg.write(part, xml);
    const copied = new Map<string, string>();
    const kept: Relationship[] = rels
      .filter((r) => !DROPPED_ON_COPY.has(r.type))
      .map((r) =>
        r.external || r.type === REL_TYPES.image
          ? r
          : {
              ...r,
              target: relativeTarget(
                part,
                this.copyPart(resolveTarget(source.part, r.target), copied),
              ),
            },
      );
    this.pkg.setRelationships(part, kept);
    const entry = this.register(name, part);
    this.sheets.splice(this.sheets.indexOf(after) + 1, 0, entry);
    this.copySheetNames(source, entry);
    return entry;
  }

  /** Sheet-level named ranges (print areas and titles) go with a copied sheet. */
  private copySheetNames(source: SheetEntry, copy: SheetEntry): void {
    if (source.originalIndex === null) return;
    const names = /<definedNames\b[^>]*>([\s\S]*?)<\/definedNames>/.exec(this.xml);
    if (!names) return;
    const extra = [...names[1]!.matchAll(/<definedName\b[^>]*>[\s\S]*?<\/definedName>/g)]
      .map((m) => m[0])
      .filter(
        (d) =>
          attributes(d.slice(0, d.indexOf('>') + 1)).get('localSheetId') ===
          String(source.originalIndex),
      )
      .map((d) =>
        d
          .replace(/localSheetId="\d+"/, `localSheetId="@${copy.part}"`)
          .replace(sheetRefPattern(source.name), `${quoteSheet(copy.name)}!`),
      );
    if (extra.length)
      this.xml = this.xml.replace('</definedNames>', `${extra.join('')}</definedNames>`);
  }

  removeSheet(name: string): void {
    const entry = this.sheet(name);
    this.sheets = this.sheets.filter((s) => s !== entry);
    const rels = this.pkg.relationships(this.workbookPart);
    const rel = rels.find(
      (r) => !r.external && resolveTarget(this.workbookPart, r.target) === entry.part,
    );
    this.pkg.setRelationships(
      this.workbookPart,
      rels.filter((r) => r !== rel),
    );
    this.removePart(entry.part);
    // Names scoped to the sheet go with it; references to it elsewhere become #REF!.
    this.xml = this.xml.replace(/<definedName\b[^>]*>[\s\S]*?<\/definedName>/g, (d) => {
      const local = attributes(d.slice(0, d.indexOf('>') + 1)).get('localSheetId');
      if (local === String(entry.originalIndex) || local === `@${entry.part}`) return '';
      return d.replace(sheetRangePattern(entry.name), '#REF!');
    });
  }

  /** Removes a part, its relationships and the parts only it used. */
  private removePart(part: string): void {
    const owned = this.pkg
      .relationships(part)
      .filter((r) => !r.external)
      .map((r) => resolveTarget(part, r.target));
    this.pkg.remove(part);
    this.pkg.remove(relsPartOf(part));
    this.pkg.setContentTypeOverride(part, null);
    for (const target of owned) {
      if (!this.pkg.has(target) || this.isReferenced(target)) continue;
      this.removePart(target);
    }
  }

  private isReferenced(part: string): boolean {
    return this.pkg
      .names()
      .filter((n) => n.endsWith('.rels'))
      .some((rels) => {
        const owner = rels.replace(/_rels\/([^/]*)\.rels$/, '$1');
        return this.pkg
          .relationships(owner)
          .some((r) => !r.external && resolveTarget(owner, r.target) === part);
      });
  }

  addSheet(name: string, xml: string): SheetEntry {
    const part = this.pkg.freeName('xl/worksheets/', 'sheet', '.xml');
    this.pkg.write(part, xml);
    const entry = this.register(name, part);
    this.sheets.push(entry);
    return entry;
  }

  /** Excel recalculates every formula on opening; the stale calculation chain goes. */
  private recalculateOnOpen(): void {
    const rels = this.pkg.relationships(this.workbookPart);
    const chain = rels.find((r) => r.type === REL_TYPES.calcChain);
    if (chain) {
      const part = resolveTarget(this.workbookPart, chain.target);
      this.pkg.setRelationships(
        this.workbookPart,
        rels.filter((r) => r !== chain),
      );
      this.pkg.remove(part);
      this.pkg.setContentTypeOverride(part, null);
    }
    if (/<calcPr\b/.test(this.xml)) {
      this.xml = this.xml.replace(/<calcPr\b[^>]*?\/?>/, (tag) =>
        setAttribute(tag, 'fullCalcOnLoad', '1'),
      );
    } else {
      const at =
        /<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/.exec(
          this.xml,
        );
      const index = at ? at.index : this.xml.length;
      this.xml = `${this.xml.slice(0, index)}<calcPr fullCalcOnLoad="1"/>${this.xml.slice(index)}`;
    }
  }

  /** Writes workbook.xml: the sheet list, sheet-scoped names and the active tab. */
  finish(firstNew: SheetEntry | null): void {
    const index = new Map<string, number>();
    this.sheets.forEach((s, i) => {
      if (s.originalIndex !== null) index.set(String(s.originalIndex), i);
      index.set(`@${s.part}`, i);
    });
    this.xml = this.xml.replace(
      /(<sheets\b[^>]*>)[\s\S]*?(<\/sheets>)|<sheets\s*\/>/,
      (_, open: string | undefined, close: string | undefined) =>
        `${open ?? '<sheets>'}${this.sheets.map((s) => s.tag).join('')}${close ?? '</sheets>'}`,
    );
    this.xml = this.xml.replace(/<definedName\b[^>]*>/g, (tag) => {
      const local = attributes(tag).get('localSheetId');
      if (local === undefined) return tag;
      const next = index.get(local);
      return next === undefined ? tag : setAttribute(tag, 'localSheetId', String(next));
    });
    this.xml = this.xml.replace(
      /<definedName\b[^>]*localSheetId="(?![\d])[^"]*"[^>]*>[\s\S]*?<\/definedName>/g,
      '',
    );

    // The active tab: the template's, unless it was removed; then the first new sheet.
    const original = this.sheets.findIndex((s) => s.originalIndex === this.originalActive);
    const active = original >= 0 ? original : firstNew ? this.sheets.indexOf(firstNew) : 0;
    this.xml = this.xml.replace(/<workbookView\b[^>]*>/, (tag) =>
      setAttribute(
        setAttribute(tag, 'firstSheet', null),
        'activeTab',
        active > 0 ? String(active) : null,
      ),
    );
    if (original < 0 && this.sheets[active]) {
      const part = this.sheets[active]!.part;
      this.pkg.write(
        part,
        this.pkg
          .read(part)
          .replace(/<sheetView\b[^>]*>/, (tag) => setAttribute(tag, 'tabSelected', '1')),
      );
    }
    this.recalculateOnOpen();
    this.pkg.write(this.workbookPart, this.xml);
  }
}

function quoteSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `Name!` or `'Name'!` in a formula. */
function sheetRefPattern(name: string): RegExp {
  const quoted = escapeRegExp(escapeXml(name.replace(/'/g, "''")));
  return new RegExp(`(?:'${quoted}'|${escapeRegExp(escapeXml(name))})!`, 'g');
}

/** A reference into the sheet, such as `'Name'!$A$1:$B$2`. */
function sheetRangePattern(name: string): RegExp {
  return new RegExp(
    `${sheetRefPattern(name).source}\\$?[A-Z]{0,3}\\$?\\d*(?::\\$?[A-Z]{0,3}\\$?\\d*)?`,
    'g',
  );
}

/** Adds a bold style and a wrapped, top-aligned style for the extra sheets; returns their indexes. */
function addExtraStyles(
  pkg: XlsxPackage,
  workbookPart: string,
): { bold: number; wrap: number } | null {
  const rel = pkg.relationships(workbookPart).find((r) => r.type === REL_TYPES.styles);
  let part = rel ? resolveTarget(workbookPart, rel.target) : null;
  if (!part || !pkg.has(part)) {
    part = 'xl/styles.xml';
    pkg.write(part, MINIMAL_STYLES);
    pkg.setContentTypeOverride(part, CONTENT_TYPES.styles);
    if (!rel) pkg.addRelationship(workbookPart, REL_TYPES.styles, part);
  }
  let xml = pkg.read(part);
  if (
    !/<fonts\b[^>]*>[\s\S]*?<\/fonts>/.test(xml) ||
    !/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/.test(xml)
  ) {
    return null;
  }
  const firstFont =
    /<fonts\b[^>]*>\s*(<font\b[^>]*>[\s\S]*?<\/font>|<font\b[^>]*\/>)/.exec(xml)?.[1] ?? '<font/>';
  const boldFont = firstFont.includes('<b/>')
    ? firstFont
    : firstFont
        .replace(/^<font\b([^>]*?)\/>$/, '<font$1></font>')
        .replace(/^(<font\b[^>]*>)/, '$1<b/>');
  const append = (list: string, child: string, element: string): number => {
    const block = new RegExp(`<${list}\\b([^>]*)>([\\s\\S]*?)</${list}>`).exec(xml)!;
    const count = [...block[2]!.matchAll(new RegExp(`<${child}\\b`, 'g'))].length;
    const open = setAttribute(`<${list}${block[1]}>`, 'count', String(count + 1));
    xml = xml.replace(block[0], `${open}${block[2]}${element}</${list}>`);
    return count;
  };
  const font = append('fonts', 'font', boldFont);
  const bold = append(
    'cellXfs',
    'xf',
    `<xf numFmtId="0" fontId="${font}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  );
  const wrap = append(
    'cellXfs',
    'xf',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
  );
  pkg.write(part, xml);
  return { bold, wrap };
}

const MINIMAL_STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** The parts of a new, empty workbook, for exports without a template. */
function emptyWorkbook(): XlsxPackage {
  const pkg = XlsxPackage.empty();
  pkg.write(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '</Types>',
  );
  pkg.setRelationships('', [
    { id: 'rId1', type: REL_TYPES.officeDocument, target: 'xl/workbook.xml', external: false },
  ]);
  pkg.write(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView/></bookViews><sheets></sheets></workbook>',
  );
  return pkg;
}

function extraSheetXml(extra: ExtraSheet, styles: { bold: number; wrap: number } | null): string {
  return newSheetXml({
    columns: extra.columns.map((c) => ({
      width: c.width,
      ...(styles && c.width >= 40 ? { style: styles.wrap } : {}),
    })),
    rows: [extra.columns.map((c) => c.header), ...extra.rows] as CellValue[][],
    ...(styles ? { headingStyle: styles.bold } : {}),
    freezeHeading: true,
  });
}

async function openPackage(template: { bytes: ArrayBuffer; fileName: string }) {
  if (/\.xlsm$/i.test(template.fileName)) throw new TemplateError('macro');
  try {
    return await XlsxPackage.open(template.bytes);
  } catch (error) {
    throw new TemplateError('unreadable', error instanceof Error ? error.message : String(error));
  }
}

/** The template's sheet names, in order. */
export async function templateSheetNames(template: {
  bytes: ArrayBuffer;
  fileName: string;
}): Promise<string[]> {
  return new WorkbookEditor(await openPackage(template)).sheets.map((s) => s.name);
}

/**
 * Builds the output workbook: the template with the plan applied, or a new
 * workbook holding only the extra sheets.
 */
export async function writeWorkbook(
  template: { bytes: ArrayBuffer; fileName: string } | null,
  plan: ExcelPlan,
): Promise<ArrayBuffer> {
  const pkg = template ? await openPackage(template) : emptyWorkbook();
  const book = new WorkbookEditor(pkg);

  let firstNew: SheetEntry | null = null;
  const lastCopyOf = new Map<string, SheetEntry>();
  for (const copy of plan.copies) {
    const source = book.sheet(copy.source);
    const after = lastCopyOf.get(source.name) ?? source;
    const entry = book.copySheet(copy.source, copy.name, after);
    lastCopyOf.set(source.name, entry);
    firstNew ??= entry;
  }

  const bySheet = new Map<string, XlsxCellWrite[]>();
  for (const w of plan.writes) {
    const key = book.sheet(w.sheet).part;
    bySheet.set(key, [
      ...(bySheet.get(key) ?? []),
      { ref: w.address, value: w.value, ...(w.styleFrom ? { styleFrom: w.styleFrom } : {}) },
    ]);
  }
  for (const [part, writes] of bySheet) {
    try {
      pkg.write(part, writeCells(pkg.read(part), writes));
    } catch (error) {
      if (error instanceof FormulaCellError) {
        const sheet = book.sheets.find((s) => s.part === part)?.name ?? part;
        throw new TemplateError('formulaCell', `${sheet}!${error.ref}`);
      }
      throw error;
    }
  }

  for (const name of plan.removeSheets) book.removeSheet(name);

  if (plan.extraSheets.length) {
    const styles = addExtraStyles(pkg, book.workbookPart);
    for (const extra of plan.extraSheets) {
      const entry = book.addSheet(extra.name, extraSheetXml(extra, styles));
      firstNew ??= entry;
    }
  }
  book.finish(firstNew);
  return pkg.save();
}
