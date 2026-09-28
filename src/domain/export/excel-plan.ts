/**
 * Excel export plan (FDS section 7, EXP-02, NTE-03). Works out every value
 * to write into the client's template for the chosen layout mode, plus the
 * Notes, Item List and Unmapped sheets, as plain data. The ExcelJS writer
 * (features/export) only applies the plan, so all layout rules are testable
 * here without a workbook.
 */
import { buildCountTable, type CountEntry } from '../count/count';
import { drawingDisplayName } from '../drawings';
import { noteToPlainText } from '../notes/note-text';
import type {
  Actuation,
  Drawing,
  HeaderField,
  ItemField,
  Segment,
  TemplateMapping,
} from '../schema/types';
import { formatSize, sizeInInches } from '../sizes';
import type { ExportableProject } from './exportable';
import { liquidOrGas, pressureToBara, temperatureToCelsius } from './process-units';

export type CellValue = string | number | null;

export interface CellWrite {
  sheet: string;
  address: string;
  value: CellValue;
  /** Copy the style of this cell (block per segment: blocks after the first). */
  styleFrom?: string;
}

export interface ExtraSheet {
  name: string;
  columns: { header: string; width: number }[];
  rows: CellValue[][];
}

export interface UnmappedCount {
  segmentLabel: string;
  typeName: string;
  actuation: Actuation | null;
  binLabel: string;
  quantity: number;
  unit: 'items' | 'm';
}

export interface ExcelPlan {
  /** Sheet per segment: copies of the master sheet, in order. */
  copies: { source: string; name: string }[];
  /** Sheets removed after copying (the master). */
  removeSheets: string[];
  writes: CellWrite[];
  extraSheets: ExtraSheet[];
  unmapped: UnmappedCount[];
  warnings: string[];
}

/** Column headings and fixed words for the extra sheets. */
export interface ExcelLabels {
  notesSheet: string;
  itemsSheet: string;
  unmappedSheet: string;
  segment: string;
  author: string;
  time: string;
  note: string;
  itemFields: Record<ItemField, string>;
  typeName: string;
  actuation: string;
  bin: string;
  quantity: string;
  unit: string;
  actuations: Record<Actuation, string>;
  seeNotesSheet: string;
}

/** Excel's limit for text in one cell. */
const CELL_TEXT_LIMIT = 32767;
/** Longer notes are cut in the mapped cell and kept whole on the Notes sheet. */
export const NOTES_CELL_LIMIT = 8000;

// ---------------------------------------------------------------------------
// Cell and sheet names
// ---------------------------------------------------------------------------

export function splitCellRef(ref: string): { column: string; row: number | null } {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)?$/.exec(ref.trim());
  if (!m) throw new Error(`Not a cell reference: ${ref}`);
  return { column: m[1]!.toUpperCase(), row: m[2] ? Number(m[2]) : null };
}

export function columnNumber(column: string): number {
  let n = 0;
  for (const ch of column.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function columnLetters(n: number): string {
  let out = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) {
    out = String.fromCharCode(65 + ((x - 1) % 26)) + out;
  }
  return out;
}

/** Excel sheet names: at most 31 characters, none of []:*?/\, unique ignoring case. */
export function sheetName(wanted: string, taken: Set<string>): string {
  const base =
    wanted
      .replace(/[[\]:*?/\\]/g, '_')
      .replace(/^'+|'+$/g, '')
      .trim() || 'Sheet';
  let name = base.slice(0, 31);
  for (let i = 2; taken.has(name.toLowerCase()); i += 1) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(name.toLowerCase());
  return name;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function headerValues(
  project: ExportableProject,
  segment: Segment | null,
  now: Date,
): Record<HeaderField, CellValue> {
  const markers = new Map(project.markers.map((m) => [m.id, m]));
  const linked = segment
    ? project.drawings
        .filter((d) => segment.drawingIds.includes(d.id))
        .map((d) => drawingDisplayName(d))
    : [];
  const esdvTags = segment
    ? segment.boundingEsdvIds.map((id) => markers.get(id)?.esdv?.tag || '').filter(Boolean)
    : [];
  const units = project.settings.units;
  return {
    projectName: project.name,
    client: project.client,
    facility: project.facility,
    studyRef: project.studyRef,
    segmentLabel: segment?.label ?? null,
    segmentDescription: segment?.description ?? null,
    equipment: segment?.equipment ?? null,
    streamNumber: segment?.streamNumber ?? null,
    fluid: segment?.fluid ?? null,
    phase: segment?.phase ?? null,
    phaseLiquidGas: segment ? liquidOrGas(segment.phase) : null,
    pressure: segment?.pressure ?? null,
    pressureBara: segment ? pressureToBara(segment.pressure, units.pressure) : null,
    temperature: segment?.temperature ?? null,
    temperatureC: segment ? temperatureToCelsius(segment.temperature, units.temperature) : null,
    h2sMoleFraction: segment?.h2sMoleFraction ?? null,
    molecularWeightOrDensity: segment?.molecularWeightOrDensity ?? null,
    boundingEsdvTags: segment ? esdvTags.join(', ') : null,
    linkedDrawingNumbers: segment ? linked.join(', ') : null,
    date: isoDate(now),
    countedBy: segment?.countedBy ?? null,
    checkedBy: segment?.checkedBy ?? null,
    countRevision: project.countRevision,
  };
}

/** NTE-03: a segment's notes as plain text, each entry headed by author and date. */
export function segmentNotesText(project: ExportableProject, segmentId: string): string {
  return project.notes
    .filter((n) => n.segmentId === segmentId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((n) => {
      const head = [n.author, n.timestamp.slice(0, 10)].filter(Boolean).join(', ');
      return `[${head}] ${noteToPlainText(n.text)}`;
    })
    .join('\n\n');
}

/**
 * Notes as lines of at most `width` characters, broken at spaces, for a
 * template with one cell per note line. When they do not fit in `lines`
 * cells, the last cell says where the rest is.
 */
export function notesToLines(text: string, lines: number, width: number, more: string): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) continue;
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        out.push(line);
        line = '';
      }
      // A word longer than a line is cut across lines.
      let rest = line ? `${line} ${word}` : word;
      while (rest.length > width) {
        out.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  if (out.length <= lines) return out;
  const suffix = ` … (${more})`;
  const kept = out.slice(0, lines);
  const last = kept[lines - 1]!;
  kept[lines - 1] = `${last.slice(0, Math.max(0, width - suffix.length))}${suffix}`;
  return kept;
}

const countKey = (typeId: string, actuation: Actuation | null, binId: string) =>
  `${typeId}|${actuation ?? ''}|${binId}`;

interface SegmentTotals {
  counts: Map<string, number>;
  lengths: Map<string, number>;
}

function segmentTotals(
  project: ExportableProject,
  entries: readonly CountEntry[],
  segmentId: string,
): SegmentTotals {
  const table = buildCountTable(entries, project.library, segmentId, {
    pipeLengthCounting: project.settings.pipeLengthCounting,
  });
  const counts = new Map<string, number>();
  for (const group of table.groups) {
    for (const row of group.rows) {
      for (const cell of row.cells) {
        if (cell.quantity > 0)
          counts.set(countKey(row.typeId, row.actuation, cell.binId), cell.quantity);
      }
    }
  }
  const lengths = new Map<string, number>();
  for (const pipe of table.pipeLengths) {
    for (const cell of pipe.cells) if (cell.metres > 0) lengths.set(cell.binId, cell.metres);
  }
  return { counts, lengths };
}

/** One row of the item list (Item List sheet, flat item list mode and CSV). */
export function itemRows(
  project: ExportableProject,
  entries: readonly CountEntry[],
  labels: Pick<ExcelLabels, 'actuations'>,
): Record<ItemField, CellValue>[] {
  const segments = new Map(project.segments.map((s, i) => [s.id, { segment: s, order: i }]));
  const drawings = new Map<string, Drawing>(project.drawings.map((d) => [d.id, d]));
  const types = new Map(project.library.equipmentTypes.map((t) => [t.id, t]));
  const bins = new Map(project.library.binSets.flatMap((b) => b.bins.map((bin) => [bin.id, bin])));
  const items = new Map(project.items.map((i) => [i.id, i]));
  return entries
    .filter((e) => e.segmentId && segments.has(e.segmentId))
    .map((e) => {
      const segment = segments.get(e.segmentId!)!;
      const drawing = drawings.get(e.drawingId);
      const type = e.typeId ? types.get(e.typeId) : undefined;
      const item = e.kind === 'item' ? items.get(e.id) : undefined;
      return {
        order: segment.order,
        row: {
          seq: e.seq,
          segmentLabel: segment.segment.label,
          drawingNo: drawing ? drawingDisplayName(drawing) : '',
          drawingRevision: drawing?.revision ?? '',
          equipmentType: type?.name ?? '',
          excelKey: type?.excelKey ?? '',
          datasetCategory: type?.datasetCategory ?? '',
          actuation: e.actuation ? labels.actuations[e.actuation] : '',
          nominalSize: e.size ? formatSize(e.size) : '',
          sizeUnit: e.size?.unit ?? '',
          sizeInches: e.size ? sizeInInches(e.size) : null,
          bin: e.binId ? (bins.get(e.binId)?.label ?? '') : '',
          quantity: item?.quantity ?? 1,
          effectiveCount: e.issues.length ? 0 : e.quantity,
          tag: e.tag,
          pipeLength: e.pipeLength,
          remarks: item?.remarks ?? '',
        } satisfies Record<ItemField, CellValue>,
      };
    })
    .sort((a, b) => a.order - b.order || (a.row.seq ?? Infinity) - (b.row.seq ?? Infinity))
    .map((r) => r.row);
}

export const ITEM_FIELD_ORDER: ItemField[] = [
  'seq',
  'segmentLabel',
  'drawingNo',
  'drawingRevision',
  'equipmentType',
  'excelKey',
  'datasetCategory',
  'actuation',
  'nominalSize',
  'sizeUnit',
  'sizeInches',
  'bin',
  'quantity',
  'effectiveCount',
  'tag',
  'pipeLength',
  'remarks',
];

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface PlanInput {
  project: ExportableProject;
  entries: readonly CountEntry[];
  /** Null exports the three data sheets only, into a new workbook. */
  mapping: TemplateMapping | null;
  /** Sheet names already in the template, to keep new names unique. */
  templateSheets: readonly string[];
  now: Date;
  labels: ExcelLabels;
}

export function planExcelExport(input: PlanInput): ExcelPlan {
  const { project, entries, mapping, now, labels } = input;
  const plan: ExcelPlan = {
    copies: [],
    removeSheets: [],
    writes: [],
    extraSheets: [],
    unmapped: [],
    warnings: [],
  };
  const taken = new Set(input.templateSheets.map((s) => s.toLowerCase()));
  const segments: Segment[] = project.segments;
  const types = new Map(project.library.equipmentTypes.map((t) => [t.id, t]));
  const binLabels = new Map(
    project.library.binSets.flatMap((b) => b.bins.map((bin) => [bin.id, bin.label])),
  );
  const mappedCounts = new Set(
    (mapping?.countCells ?? []).map((c) => countKey(c.equipmentTypeId, c.actuation, c.binId)),
  );
  const mappedLengths = new Set((mapping?.pipeLengthCells ?? []).map((c) => c.binId));

  const write = (sheet: string, address: string, value: CellValue, styleFrom?: string) => {
    const text = typeof value === 'string' && value.length > CELL_TEXT_LIMIT;
    plan.writes.push({
      sheet,
      address,
      value: text ? (value as string).slice(0, CELL_TEXT_LIMIT) : value,
      ...(styleFrom ? { styleFrom } : {}),
    });
  };

  /** Where a mapped reference lands for the i-th segment in this layout. */
  const place = (ref: string, index: number): { address: string; styleFrom?: string } => {
    const { column, row } = splitCellRef(ref);
    switch (mapping!.layoutMode) {
      case 'rowPerSegment':
        return { address: `${column}${mapping!.startRow + index}` };
      case 'blockPerSegment': {
        const base = row ?? mapping!.startRow;
        const offset = (mapping!.blockOffset ?? 0) * index;
        return {
          address: `${column}${base + offset}`,
          ...(index > 0 && offset > 0 ? { styleFrom: `${column}${base}` } : {}),
        };
      }
      default:
        return { address: `${column}${row ?? 1}` };
    }
  };

  const allTotals = new Map(segments.map((s) => [s.id, segmentTotals(project, entries, s.id)]));

  if (mapping && mapping.layoutMode !== 'flatItemList') {
    const master = mapping.sheet;
    segments.forEach((segment, index) => {
      let sheet = master;
      if (mapping.layoutMode === 'sheetPerSegment') {
        sheet = sheetName(mapping.sheetNamePattern.replaceAll('{segment}', segment.label), taken);
        plan.copies.push({ source: master, name: sheet });
      }
      const headers = headerValues(project, segment, now);
      for (const [field, ref] of Object.entries(mapping.headerFields) as [HeaderField, string][]) {
        const at = place(ref, index);
        write(sheet, at.address, headers[field], at.styleFrom);
      }
      const totals = allTotals.get(segment.id)!;
      // Counts mapped to the same cell are added up (several bins in one template row).
      const sums = new Map<string, { address: string; styleFrom?: string; value: number }>();
      const add = (ref: string, value: number) => {
        const at = place(ref, index);
        const key = at.address.replace(/\$/g, '').toUpperCase();
        const sum = sums.get(key);
        if (sum) sum.value += value;
        else sums.set(key, { ...at, value });
      };
      for (const cell of mapping.countCells) {
        add(
          cell.cell,
          totals.counts.get(countKey(cell.equipmentTypeId, cell.actuation, cell.binId)) ?? 0,
        );
      }
      for (const cell of mapping.pipeLengthCells) {
        add(cell.cell, totals.lengths.get(cell.binId) ?? 0);
      }
      for (const sum of sums.values()) {
        write(sheet, sum.address, Number(sum.value.toPrecision(12)), sum.styleFrom);
      }
      if (mapping.notesCell) {
        const notes = segmentNotesText(project, segment.id);
        const at = place(mapping.notesCell, index);
        const cut =
          notes.length > NOTES_CELL_LIMIT
            ? `${notes.slice(0, NOTES_CELL_LIMIT)}… (${labels.seeNotesSheet})`
            : notes;
        write(sheet, at.address, cut, at.styleFrom);
      }
      if (mapping.notesLines.length > 0) {
        const lines = notesToLines(
          segmentNotesText(project, segment.id),
          mapping.notesLines.length,
          mapping.notesLineLength,
          labels.seeNotesSheet,
        );
        mapping.notesLines.forEach((ref, i) => {
          const at = place(ref, index);
          write(sheet, at.address, lines[i] ?? null, at.styleFrom);
        });
      }
    });
    if (mapping.layoutMode === 'sheetPerSegment' && segments.length > 0) {
      plan.removeSheets.push(master);
    }
  }

  if (mapping?.layoutMode === 'flatItemList') {
    const headers = headerValues(project, null, now);
    for (const [field, ref] of Object.entries(mapping.headerFields) as [HeaderField, string][]) {
      const { column, row } = splitCellRef(ref);
      if (headers[field] !== null) write(mapping.sheet, `${column}${row ?? 1}`, headers[field]);
    }
    itemRows(project, entries, labels).forEach((row, i) => {
      for (const [field, ref] of Object.entries(mapping.itemColumns) as [ItemField, string][]) {
        write(mapping.sheet, `${splitCellRef(ref).column}${mapping.startRow + i}`, row[field]);
      }
    });
  }

  // Unmapped counts (section 7): nothing is lost silently. A flat item list
  // writes every item, so it leaves nothing unmapped.
  const countsMapped = mapping !== null;
  const flat = mapping?.layoutMode === 'flatItemList';
  for (const segment of flat ? [] : segments) {
    const totals = allTotals.get(segment.id)!;
    for (const [key, quantity] of totals.counts) {
      if (countsMapped && mappedCounts.has(key)) continue;
      const [typeId, actuation, binId] = key.split('|') as [string, string, string];
      plan.unmapped.push({
        segmentLabel: segment.label,
        typeName: types.get(typeId)?.name ?? typeId,
        actuation: (actuation || null) as Actuation | null,
        binLabel: binLabels.get(binId) ?? binId,
        quantity,
        unit: 'items',
      });
    }
    for (const [binId, metres] of totals.lengths) {
      if (countsMapped && mappedLengths.has(binId)) continue;
      const pipe = project.library.equipmentTypes.find((t) => t.category === 'pipe');
      plan.unmapped.push({
        segmentLabel: segment.label,
        typeName: pipe?.name ?? 'Pipe',
        actuation: null,
        binLabel: binLabels.get(binId) ?? binId,
        quantity: metres,
        unit: 'm',
      });
    }
  }

  // Notes, Item List and Unmapped sheets (EXP-02, NTE-03).
  plan.extraSheets.push({
    name: sheetName(labels.notesSheet, taken),
    columns: [
      { header: labels.segment, width: 14 },
      { header: labels.author, width: 10 },
      { header: labels.time, width: 20 },
      { header: labels.note, width: 90 },
    ],
    rows: project.notes
      .filter((n) => segments.some((s) => s.id === n.segmentId))
      .sort((a, b) => {
        const sa = segments.findIndex((s) => s.id === a.segmentId);
        const sb = segments.findIndex((s) => s.id === b.segmentId);
        return sa - sb || a.timestamp.localeCompare(b.timestamp);
      })
      .map((n) => [
        segments.find((s) => s.id === n.segmentId)!.label,
        n.author,
        n.timestamp.replace('T', ' ').slice(0, 16),
        noteToPlainText(n.text),
      ]),
  });
  plan.extraSheets.push({
    name: sheetName(labels.itemsSheet, taken),
    columns: ITEM_FIELD_ORDER.map((field) => ({
      header: labels.itemFields[field],
      width: field === 'remarks' ? 40 : field === 'equipmentType' ? 26 : 13,
    })),
    rows: itemRows(project, entries, labels).map((row) => ITEM_FIELD_ORDER.map((f) => row[f])),
  });
  plan.extraSheets.push({
    name: sheetName(labels.unmappedSheet, taken),
    columns: [
      { header: labels.segment, width: 14 },
      { header: labels.typeName, width: 28 },
      { header: labels.actuation, width: 12 },
      { header: labels.bin, width: 16 },
      { header: labels.quantity, width: 10 },
      { header: labels.unit, width: 8 },
    ],
    rows: plan.unmapped.map((u) => [
      u.segmentLabel,
      u.typeName,
      u.actuation ? labels.actuations[u.actuation] : '',
      u.binLabel,
      u.quantity,
      u.unit,
    ]),
  });
  return plan;
}

/** EXP-06: the item list as CSV (RFC 4180), with a header row. */
export function itemListCsv(
  rows: readonly Record<ItemField, CellValue>[],
  headers: Record<ItemField, string>,
): string {
  const escape = (value: CellValue) => {
    const text = value === null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [ITEM_FIELD_ORDER.map((f) => escape(headers[f])).join(',')];
  for (const row of rows) lines.push(ITEM_FIELD_ORDER.map((f) => escape(row[f])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
