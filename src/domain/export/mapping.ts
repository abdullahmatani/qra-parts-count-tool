/**
 * Template mapping helpers (FDS section 7, roadmap #36, #39): defaults,
 * auto-fill of count cells, checks, and a portable mapping file that can be
 * reused in other projects with the same client template.
 */
import type {
  Actuation,
  CountCell,
  HeaderField,
  ItemField,
  Library,
  PipeLengthCell,
  TemplateMapping,
} from '../schema/types';
import { columnLetters, columnNumber, splitCellRef } from './excel-plan';

export const CELL_REF = /^\$?[A-Za-z]{1,3}\$?(\d{1,7})?$/;

export function isCellRef(text: string): boolean {
  return CELL_REF.test(text.trim());
}

export function defaultMapping(templateFile: string, sheet: string): TemplateMapping {
  return {
    templateFile,
    layoutMode: 'sheetPerSegment',
    sheet,
    startRow: 1,
    blockOffset: null,
    sheetNamePattern: '{segment}',
    headerFields: {},
    countCells: [],
    pipeLengthCells: [],
    notesCell: null,
    notesLines: [],
    notesLineLength: 90,
    itemColumns: {},
  };
}

/** Cells as the mapper shows them: "B72:B77" when they run down one column, else a list. */
export function formatCellList(refs: readonly string[]): string {
  if (refs.length === 0) return '';
  const cells = refs.map((ref) => splitCellRef(ref));
  const column = cells[0]!.column;
  const first = cells[0]!.row ?? 0;
  const run = cells.every((c, i) => c.column === column && c.row === first + i);
  return run && refs.length > 1
    ? `${column}${first}:${column}${first + refs.length - 1}`
    : refs.join(', ');
}

/** Cells from "B72:B77" (one column) or "B72, B73"; null when the text is not that. */
export function parseCellList(text: string): string[] | null {
  const trimmed = text.trim().toUpperCase();
  if (!trimmed) return [];
  const range = /^\$?([A-Z]{1,3})\$?(\d{1,7}):\$?([A-Z]{1,3})\$?(\d{1,7})$/.exec(trimmed);
  if (range) {
    const [, c1, r1, c2, r2] = range;
    const from = Number(r1);
    const to = Number(r2);
    if (c1 !== c2 || to < from || to - from >= 200) return null;
    return Array.from({ length: to - from + 1 }, (_, i) => `${c1}${from + i}`);
  }
  const refs = trimmed.split(/[\s,;]+/).filter(Boolean);
  return refs.every((ref) => /^\$?[A-Z]{1,3}\$?\d{1,7}$/.test(ref))
    ? refs.map((ref) => ref.replace(/\$/g, ''))
    : null;
}

/** A row of the count table as the mapper lists it: a type, and an actuation for valves. */
export interface CountRowKey {
  equipmentTypeId: string;
  actuation: Actuation | null;
}

/** Every countable row of the library, in library order (automated before manual). */
export function countRowKeys(library: Library): CountRowKey[] {
  return library.equipmentTypes
    .filter((type) => type.category !== 'pipe')
    .flatMap((type): CountRowKey[] =>
      type.hasActuation
        ? (['automated', 'manual'] as const).map((actuation) => ({
            equipmentTypeId: type.id,
            actuation,
          }))
        : [{ equipmentTypeId: type.id, actuation: null }],
    );
}

/** The bins of a row: the actuation's bin set, else the type's. */
export function rowBins(library: Library, row: CountRowKey) {
  const type = library.equipmentTypes.find((t) => t.id === row.equipmentTypeId);
  const id =
    (type?.hasActuation && row.actuation ? type.actuationBinSetIds[row.actuation] : null) ??
    type?.binSetId;
  return library.binSets.find((b) => b.id === id)?.bins ?? [];
}

/**
 * Fills count cells as a block: one row per type (and actuation) going down
 * from `start`, one column per bin going right. Existing cells are replaced.
 */
export function autoFillCountCells(
  library: Library,
  start: string,
  rows = countRowKeys(library),
): CountCell[] {
  const { column, row } = splitCellRef(start);
  const firstColumn = columnNumber(column);
  const firstRow = row ?? 1;
  return rows.flatMap((key, r) =>
    rowBins(library, key).map((bin, c) => ({
      equipmentTypeId: key.equipmentTypeId,
      actuation: key.actuation,
      binId: bin.id,
      cell: `${columnLetters(firstColumn + c)}${firstRow + r}`,
    })),
  );
}

/**
 * Cells used more than once in the mapping, which would overwrite each other.
 * Several counts may share a cell, as their totals are added up (for example
 * bins 3"–6" and 6"–11" into one 3"–11" row), and so may pipe lengths.
 */
export function duplicateCells(mapping: TemplateMapping): string[] {
  const key = (ref: string) => ref.replace(/\$/g, '').toUpperCase();
  const uses = [
    ...Object.values(mapping.headerFields)
      .filter((r): r is string => !!r)
      .map(key),
    ...(mapping.notesCell ? [key(mapping.notesCell)] : []),
    ...mapping.notesLines.map(key),
    ...new Set(mapping.countCells.map((c) => key(c.cell))),
    ...new Set(mapping.pipeLengthCells.map((c) => key(c.cell))),
  ];
  const seen = new Map<string, number>();
  for (const use of uses) seen.set(use, (seen.get(use) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([ref]) => ref);
}

// ---------------------------------------------------------------------------
// Portable mapping file (#39)
// ---------------------------------------------------------------------------

export const MAPPING_FILE_KIND = 'qrapc-template-mapping';

/** Types by Excel key (or name) and bins by label, so ids from another project do not matter. */
export interface PortableMapping {
  kind: typeof MAPPING_FILE_KIND;
  version: 1;
  templateFile: string;
  layoutMode: TemplateMapping['layoutMode'];
  sheet: string;
  startRow: number;
  blockOffset: number | null;
  sheetNamePattern: string;
  headerFields: Partial<Record<HeaderField, string>>;
  countCells: { type: string; actuation: Actuation | null; bin: string; cell: string }[];
  pipeLengthCells: { bin: string; cell: string }[];
  notesCell: string | null;
  /** Added in 2.1; absent in older mapping files. */
  notesLines?: string[];
  notesLineLength?: number;
  itemColumns: Partial<Record<ItemField, string>>;
}

export function toPortableMapping(mapping: TemplateMapping, library: Library): PortableMapping {
  const types = new Map(library.equipmentTypes.map((t) => [t.id, t]));
  const bins = new Map(library.binSets.flatMap((b) => b.bins.map((bin) => [bin.id, bin.label])));
  return {
    kind: MAPPING_FILE_KIND,
    version: 1,
    templateFile: mapping.templateFile,
    layoutMode: mapping.layoutMode,
    sheet: mapping.sheet,
    startRow: mapping.startRow,
    blockOffset: mapping.blockOffset,
    sheetNamePattern: mapping.sheetNamePattern,
    headerFields: mapping.headerFields,
    countCells: mapping.countCells.map((c) => {
      const type = types.get(c.equipmentTypeId);
      return {
        type: type?.excelKey || type?.name || c.equipmentTypeId,
        actuation: c.actuation,
        bin: bins.get(c.binId) ?? c.binId,
        cell: c.cell,
      };
    }),
    pipeLengthCells: mapping.pipeLengthCells.map((c) => ({
      bin: bins.get(c.binId) ?? c.binId,
      cell: c.cell,
    })),
    notesCell: mapping.notesCell,
    notesLines: mapping.notesLines,
    notesLineLength: mapping.notesLineLength,
    itemColumns: mapping.itemColumns,
  };
}

/**
 * Reads a portable mapping into this project's library. Cells whose type or
 * bin cannot be found are left out and reported.
 */
export function fromPortableMapping(
  portable: PortableMapping,
  library: Library,
  templateFile: string,
): { mapping: TemplateMapping; unresolved: string[] } {
  if (portable.kind !== MAPPING_FILE_KIND || portable.version !== 1) {
    throw new Error('Not a template mapping file');
  }
  const unresolved: string[] = [];
  const findType = (key: string) =>
    library.equipmentTypes.find((t) => t.excelKey && t.excelKey === key) ??
    library.equipmentTypes.find((t) => t.name.toLowerCase() === key.toLowerCase());
  const countCells: CountCell[] = [];
  for (const c of portable.countCells) {
    const type = findType(c.type);
    const bins = type ? rowBins(library, { equipmentTypeId: type.id, actuation: c.actuation }) : [];
    const bin = bins.find((b) => b.label === c.bin);
    if (!type || !bin || !isCellRef(c.cell)) {
      unresolved.push(`${c.type}${c.actuation ? ` (${c.actuation})` : ''} ${c.bin} → ${c.cell}`);
      continue;
    }
    countCells.push({
      equipmentTypeId: type.id,
      actuation: type.hasActuation ? c.actuation : null,
      binId: bin.id,
      cell: c.cell,
    });
  }
  const pipe = library.equipmentTypes.find((t) => t.category === 'pipe');
  const pipeBins = pipe ? rowBins(library, { equipmentTypeId: pipe.id, actuation: null }) : [];
  const pipeLengthCells: PipeLengthCell[] = [];
  for (const c of portable.pipeLengthCells) {
    const bin = pipeBins.find((b) => b.label === c.bin);
    if (!bin || !isCellRef(c.cell)) unresolved.push(`pipe ${c.bin} → ${c.cell}`);
    else pipeLengthCells.push({ binId: bin.id, cell: c.cell });
  }
  const refs = <K extends string>(record: Partial<Record<K, string>>) =>
    Object.fromEntries(
      Object.entries(record).filter(([, ref]) => isCellRef(String(ref))),
    ) as Partial<Record<K, string>>;
  return {
    mapping: {
      templateFile,
      layoutMode: portable.layoutMode,
      sheet: portable.sheet,
      startRow: Math.max(1, Math.round(portable.startRow || 1)),
      blockOffset: portable.blockOffset,
      sheetNamePattern: portable.sheetNamePattern || '{segment}',
      headerFields: refs(portable.headerFields ?? {}),
      countCells,
      pipeLengthCells,
      notesCell: portable.notesCell && isCellRef(portable.notesCell) ? portable.notesCell : null,
      notesLines: (portable.notesLines ?? []).filter((ref) => isCellRef(ref)),
      notesLineLength: Math.min(1000, Math.max(20, Math.round(portable.notesLineLength ?? 90))),
      itemColumns: refs(portable.itemColumns ?? {}),
    },
    unresolved,
  };
}
