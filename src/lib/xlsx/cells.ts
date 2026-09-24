/**
 * Cell values written straight into worksheet XML, touching only the cells
 * written: each keeps its style (`s`), text goes in as an inline string so the
 * shared strings stay as they were, and everything else in the sheet is left
 * byte for byte. Cells that hold a formula are never overwritten.
 */
import { attributes, escapeXml, setAttribute } from './package';

export type XlsxValue = string | number | null;

export interface XlsxCellWrite {
  /** Cell reference such as "B4". */
  ref: string;
  value: XlsxValue;
  /** Give the cell the style of this cell on the same sheet. */
  styleFrom?: string;
}

export class FormulaCellError extends Error {
  readonly ref: string;

  constructor(ref: string) {
    super(`Cell ${ref} holds a formula and is not overwritten.`);
    this.name = 'FormulaCellError';
    this.ref = ref;
  }
}

export function parseRef(ref: string): { column: number; row: number } {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!m) throw new Error(`Not a cell reference: ${ref}`);
  let column = 0;
  for (const ch of m[1]!.toUpperCase()) column = column * 26 + (ch.charCodeAt(0) - 64);
  return { column, row: Number(m[2]) };
}

export function refOf(column: number, row: number): string {
  let letters = '';
  for (let x = column; x > 0; x = Math.floor((x - 1) / 26)) {
    letters = String.fromCharCode(65 + ((x - 1) % 26)) + letters;
  }
  return `${letters}${row}`;
}

/** Characters XML 1.0 cannot carry are dropped; line breaks and tabs stay. */
function xmlText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return escapeXml(text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, ''));
}

/** The XML of one cell with a value, keeping the given start-tag attributes. */
export function cellXml(ref: string, value: XlsxValue, style: string | null): string {
  const s = style !== null ? ` s="${style}"` : '';
  if (value === null || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

interface CellSpan {
  column: number;
  start: number;
  end: number;
  xml: string;
}

interface RowSpan {
  row: number;
  start: number;
  end: number;
  open: string;
  inner: string | null;
}

function rowsOf(sheetData: string): RowSpan[] {
  const rows: RowSpan[] = [];
  let last = 0;
  for (const m of sheetData.matchAll(/<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g)) {
    const open = m[0].slice(0, m[0].indexOf('>') + 1);
    const r = attributes(open).get('r');
    const row = r ? Number(r) : last + 1;
    last = row;
    rows.push({
      row,
      start: m.index,
      end: m.index + m[0].length,
      open: m[2] === '/>' ? open.replace(/\/>$/, '>') : open,
      inner: m[2] === '/>' ? null : (m[3] ?? ''),
    });
  }
  return rows;
}

function cellsOf(inner: string, row: number): CellSpan[] {
  const cells: CellSpan[] = [];
  let last = 0;
  for (const m of inner.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const r = attributes(m[0].slice(0, m[0].indexOf('>') + 1)).get('r');
    const column = r ? parseRef(r).column : last + 1;
    if (r && parseRef(r).row !== row) continue;
    last = column;
    cells.push({ column, start: m.index, end: m.index + m[0].length, xml: m[0] });
  }
  return cells;
}

/** The style index of a cell, or null. */
export function cellStyle(sheetXml: string, ref: string): string | null {
  const cell = findCell(sheetXml, ref);
  return cell ? (attributes(cell.slice(0, cell.indexOf('>') + 1)).get('s') ?? null) : null;
}

/** The XML of a cell, or null when the sheet has no such cell. */
export function findCell(sheetXml: string, ref: string): string | null {
  const { column, row } = parseRef(ref);
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(sheetXml);
  if (!data) return null;
  const found = rowsOf(data[1]!).find((r) => r.row === row);
  if (!found?.inner) return null;
  return cellsOf(found.inner, row).find((c) => c.column === column)?.xml ?? null;
}

/** Writes values into a worksheet's XML; returns the new XML. */
export function writeCells(sheetXml: string, writes: readonly XlsxCellWrite[]): string {
  if (writes.length === 0) return sheetXml;
  // Styles are read before anything changes, so a copied style is the template's.
  const styles = new Map<string, string | null>();
  for (const w of writes) {
    if (w.styleFrom && !styles.has(w.styleFrom))
      styles.set(w.styleFrom, cellStyle(sheetXml, w.styleFrom));
  }
  let xml = sheetXml;
  if (/<sheetData\s*\/>/.test(xml))
    xml = xml.replace(/<sheetData\s*\/>/, '<sheetData></sheetData>');
  const match = /(<sheetData\b[^>]*>)([\s\S]*?)(<\/sheetData>)/.exec(xml);
  if (!match) throw new Error('The worksheet has no sheetData.');
  let data = match[2]!;

  // Last write to a cell wins, as it would in Excel.
  const byCell = new Map<string, XlsxCellWrite>();
  for (const w of writes) {
    const { column, row } = parseRef(w.ref);
    byCell.set(refOf(column, row), w);
  }
  const byRow = new Map<number, { column: number; ref: string; write: XlsxCellWrite }[]>();
  for (const [ref, write] of byCell) {
    const { column, row } = parseRef(ref);
    byRow.set(row, [...(byRow.get(row) ?? []), { column, ref, write }]);
  }

  const rows = rowsOf(data);
  const rowNumbers = [...byRow.keys()].sort((a, b) => b - a);
  // Work from the bottom up so earlier offsets stay valid.
  for (const rowNumber of rowNumbers) {
    const wanted = byRow.get(rowNumber)!.sort((a, b) => a.column - b.column);
    const existing = rows.find((r) => r.row === rowNumber);
    let inner = existing?.inner ?? '';
    let spansOk = true;
    for (const { column, ref, write } of wanted.slice().reverse()) {
      const cells = cellsOf(inner, rowNumber);
      const found = cells.find((c) => c.column === column);
      const style =
        write.styleFrom !== undefined
          ? (styles.get(write.styleFrom) ?? null)
          : found
            ? (attributes(found.xml.slice(0, found.xml.indexOf('>') + 1)).get('s') ?? null)
            : null;
      if (found && /<f[\s>/]/.test(found.xml)) throw new FormulaCellError(ref);
      const next = cellXml(ref, write.value, style);
      if (found) {
        inner = inner.slice(0, found.start) + next + inner.slice(found.end);
      } else {
        spansOk = false;
        const after = cells.find((c) => c.column > column);
        const at = after ? after.start : inner.length;
        inner = inner.slice(0, at) + next + inner.slice(at);
      }
    }
    if (existing) {
      // `spans` is only a hint for Excel; drop it when the row gains cells.
      const open = spansOk ? existing.open : setAttribute(existing.open, 'spans', null);
      data = data.slice(0, existing.start) + `${open}${inner}</row>` + data.slice(existing.end);
    } else {
      const after = rows.find((r) => r.row > rowNumber);
      const at = after ? after.start : data.length;
      data = data.slice(0, at) + `<row r="${rowNumber}">${inner}</row>` + data.slice(at);
    }
  }
  return (
    xml.slice(0, match.index) +
    match[1] +
    data +
    match[3] +
    xml.slice(match.index + match[0].length)
  );
}

export interface NewSheet {
  columns: { width: number; style?: number }[];
  /** Rows from row 1; the first is the heading row. */
  rows: XlsxValue[][];
  headingStyle?: number;
  /** Freeze the heading row. */
  freezeHeading?: boolean;
}

/** A plain worksheet built from rows of values. */
export function newSheetXml(sheet: NewSheet): string {
  const cols = sheet.columns
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"${c.style !== undefined ? ` style="${c.style}"` : ''}/>`,
    )
    .join('');
  const rows = sheet.rows
    .map((values, r) => {
      const cells = values
        .map((value, c) => {
          const style = r === 0 ? sheet.headingStyle : sheet.columns[c]?.style;
          return value === null || value === ''
            ? ''
            : cellXml(refOf(c + 1, r + 1), value, style !== undefined ? String(style) : null);
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const pane = sheet.freezeHeading
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}
