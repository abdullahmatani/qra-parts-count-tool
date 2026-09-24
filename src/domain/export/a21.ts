/**
 * The A2.1 parts count sheet: the QRA template in use, one sheet per
 * isolatable segment. Its yellow cells are the inputs; everything else
 * (formulas, leak frequencies, protection) is left alone. This module
 * recognises the template and maps the project onto its input cells.
 *
 *   B4:B13   segment data (ID, description, equipment, PEFS, stream, P, T, phase, H2S, MW)
 *   B19:B21  small-bore instrument connections by size
 *   C22:G26  manual valves, actuated valves, flanges, flanged joints, pipe length by size
 *   E28:E41  equipment counts (compressors … plate and frame heat exchangers)
 *   B72:B77  notes, one line per row
 */
import {
  A21_EQUIPMENT,
  A21_SIZE_EDGES,
  A21_SMALL_BORE_EDGES,
  type Edge,
} from '../count/starter-library';
import type {
  Bin,
  CountCell,
  FlangeConvention,
  HeaderField,
  Library,
  PipeLengthCell,
  TemplateMapping,
} from '../schema/types';
import { countRowKeys, rowBins } from './mapping';

export const A21_MASTER_SHEET = 'PartsCountSheet';

export const A21_HEADER_CELLS: Partial<Record<HeaderField, string>> = {
  segmentLabel: 'B4',
  segmentDescription: 'B5',
  equipment: 'B6',
  linkedDrawingNumbers: 'B7',
  streamNumber: 'B8',
  pressureBara: 'B9',
  temperatureC: 'B10',
  phaseLiquidGas: 'B11',
  h2sMoleFraction: 'B12',
  molecularWeightOrDensity: 'B13',
};

export const A21_NOTES_LINES = ['B72', 'B73', 'B74', 'B75', 'B76', 'B77'];

/** The labels that identify the sheet, by cell (compared ignoring case and spaces). */
const SIGNATURE: Record<string, string> = {
  A4: 'isolatable section id',
  A13: 'mol.weight/density',
  C15: 'number of valves',
  A28: 'compressors centrifugal',
  A41: 'plate & frame he',
};

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** The name of the A2.1 sheet in a template, from its preview (row 1 first), or null. */
export function findA21Sheet(sheets: readonly { name: string; rows: string[][] }[]): string | null {
  const at = (rows: string[][], ref: string) => {
    const m = /^([A-Z])(\d+)$/.exec(ref)!;
    return rows[Number(m[2]) - 1]?.[m[1]!.charCodeAt(0) - 65] ?? '';
  };
  const found = sheets.find((sheet) =>
    Object.entries(SIGNATURE).every(([ref, label]) => normalise(at(sheet.rows, ref)) === label),
  );
  return found?.name ?? null;
}

/** Whether a bin lies wholly inside the range lower < x ≤ upper. */
function within(bin: Bin, [lower, upper]: Edge): boolean {
  const aboveLower =
    lower === null ||
    (bin.lower !== null && (bin.lower > lower || (bin.lower === lower && !bin.lowerInclusive)));
  const belowUpper = upper === null || (bin.upper !== null && bin.upper <= upper);
  return aboveLower && belowUpper;
}

/** The A2.1 row for a bin, or null when the bin straddles two rows. */
function rowFor(bin: Bin, edges: readonly Edge[], firstRow: number): number | null {
  const index = edges.findIndex((edge) => within(bin, edge));
  return index < 0 ? null : firstRow + index;
}

/**
 * The A2.1 mapping for a library. Types are matched by category (valves,
 * flanges, small bore, pipe) or Excel key (equipment rows); bins by size, so
 * finer bins add up into an A2.1 row (3"–6" and 6"–11" into 3"–11"). Flanges
 * go to "flanges" or "flanged joints" by the project's flange convention.
 */
export function a21Mapping(
  library: Library,
  flangeConvention: FlangeConvention,
  templateFile: string,
  sheet: string = A21_MASTER_SHEET,
): TemplateMapping {
  const countCells: CountCell[] = [];
  const equipmentRows = new Map(A21_EQUIPMENT.map((e) => [e.excelKey, e.row]));
  const flangeColumn = flangeConvention === 'perFace' ? 'E' : 'F';
  for (const key of countRowKeys(library)) {
    const type = library.equipmentTypes.find((t) => t.id === key.equipmentTypeId)!;
    const bins = rowBins(library, key);
    const sized = (column: string, edges: readonly Edge[], firstRow: number) => {
      for (const bin of bins) {
        const row = rowFor(bin, edges, firstRow);
        if (row !== null) countCells.push({ ...key, binId: bin.id, cell: `${column}${row}` });
      }
    };
    if (type.category === 'valve') {
      sized(key.actuation === 'automated' ? 'D' : 'C', A21_SIZE_EDGES, 22);
    } else if (type.category === 'flange') {
      sized(flangeColumn, A21_SIZE_EDGES, 22);
    } else if (type.category === 'smallBore') {
      sized('B', A21_SMALL_BORE_EDGES, 19);
    } else {
      const row = equipmentRows.get(type.excelKey);
      if (row !== undefined) {
        for (const bin of bins) countCells.push({ ...key, binId: bin.id, cell: `E${row}` });
      }
    }
  }
  const pipeLengthCells: PipeLengthCell[] = [];
  const pipe = library.equipmentTypes.find((t) => t.category === 'pipe');
  if (pipe) {
    for (const bin of rowBins(library, { equipmentTypeId: pipe.id, actuation: null })) {
      const row = rowFor(bin, A21_SIZE_EDGES, 22);
      if (row !== null) pipeLengthCells.push({ binId: bin.id, cell: `G${row}` });
    }
  }
  return {
    templateFile,
    layoutMode: 'sheetPerSegment',
    sheet,
    startRow: 1,
    blockOffset: null,
    sheetNamePattern: '{segment}',
    headerFields: { ...A21_HEADER_CELLS },
    countCells,
    pipeLengthCells,
    notesCell: null,
    notesLines: [...A21_NOTES_LINES],
    // B:G of the sheet takes about 90 characters of Arial 10.
    notesLineLength: 90,
    itemColumns: {},
  };
}
