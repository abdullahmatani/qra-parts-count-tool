import { describe, expect, it } from 'vitest';
import { binLabel } from '../count/bins';
import { A21_EQUIPMENT, starterLibrary } from '../count/starter-library';
import type { Library } from '../schema/types';
import { A21_HEADER_CELLS, A21_NOTES_LINES, a21Mapping, findA21Sheet } from './a21';
import { duplicateCells } from './mapping';

/** The labels of the A2.1 sheet, as the template preview returns them (row 1 first). */
function a21Rows(): string[][] {
  const rows = Array.from({ length: 77 }, () => Array.from({ length: 20 }, () => ''));
  const put = (ref: string, text: string) => {
    const m = /^([A-Z])(\d+)$/.exec(ref)!;
    rows[Number(m[2]) - 1]![m[1]!.charCodeAt(0) - 65] = text;
  };
  put('A4', 'Isolatable section ID');
  put('A13', 'Mol.Weight/Density ');
  put('C15', 'Number of Valves');
  put('A28', 'Compressors centrifugal');
  put('A41', 'Plate & Frame HE');
  return rows;
}

function cellsOf(library: Library, mapping: ReturnType<typeof a21Mapping>) {
  const types = new Map(library.equipmentTypes.map((t) => [t.id, t]));
  const bins = new Map(library.binSets.flatMap((s) => s.bins.map((b) => [b.id, b.label])));
  return new Map(
    mapping.countCells.map((c) => [
      `${types.get(c.equipmentTypeId)!.excelKey}|${c.actuation ?? ''}|${bins.get(c.binId)}`,
      c.cell,
    ]),
  );
}

describe('A2.1 parts count sheet', () => {
  it('is recognised by its labels, whatever the sheet is called', () => {
    expect(
      findA21Sheet([
        { name: 'Other', rows: [] },
        { name: 'PartsCountSheet', rows: a21Rows() },
      ]),
    ).toBe('PartsCountSheet');
    expect(findA21Sheet([{ name: 'Copy of A2.1', rows: a21Rows() }])).toBe('Copy of A2.1');
    const other = a21Rows();
    other[27]![0] = 'Pumps';
    expect(findA21Sheet([{ name: 'Client', rows: other }])).toBeNull();
  });

  it('maps the starter library onto every input cell, one sheet per segment', () => {
    const library = starterLibrary();
    const mapping = a21Mapping(library, 'perJoint', 'A2.1.xlsx');
    expect(mapping).toMatchObject({
      layoutMode: 'sheetPerSegment',
      sheet: 'PartsCountSheet',
      sheetNamePattern: '{segment}',
      headerFields: A21_HEADER_CELLS,
      notesLines: A21_NOTES_LINES,
    });
    expect(duplicateCells(mapping)).toEqual([]);
    const cells = cellsOf(library, mapping);
    expect(cells.get('valve|manual|≤ 1"')).toBe('C22');
    expect(cells.get('valve|manual|3" < x ≤ 11"')).toBe('C25');
    expect(cells.get('valve|automated|> 11"')).toBe('D26');
    // Flanged joints under the per-joint convention.
    expect(cells.get('flange||1" < x ≤ 2"')).toBe('F23');
    expect(cells.get('smallBore||≤ 1/2"')).toBe('B19');
    expect(cells.get('smallBore||> 1"')).toBe('B21');
    for (const equipment of A21_EQUIPMENT) {
      expect(cells.get(`${equipment.excelKey}||All sizes`), equipment.name).toBe(
        `E${equipment.row}`,
      );
    }
    expect(mapping.pipeLengthCells.map((c) => c.cell)).toEqual(['G22', 'G23', 'G24', 'G25', 'G26']);
    // 5 valve bins × 2 actuations, 5 flange bins, 3 small-bore bins, 14 equipment rows.
    expect(mapping.countCells).toHaveLength(10 + 5 + 3 + 14);
  });

  it('puts flanges in the flange-face column under the per-face convention', () => {
    const library = starterLibrary();
    const cells = cellsOf(library, a21Mapping(library, 'perFace', 'A2.1.xlsx'));
    expect(cells.get('flange||2" < x ≤ 3"')).toBe('E24');
  });

  it('adds finer bins into the A2.1 row that contains them, and leaves straddling bins out', () => {
    const library = starterLibrary();
    const manual = library.binSets.find((s) => s.name === 'Valves, manual')!;
    const edges: [number | null, number | null][] = [
      [null, 1],
      [1, 2],
      [2, 3],
      [3, 6],
      [6, 11],
      [11, 16],
      [16, null],
      [0.5, 1.5],
    ];
    manual.bins = edges.map(([lower, upper], i) => {
      const bin = { lower, lowerInclusive: false, upper, upperInclusive: true };
      return { id: `bin_${i}`, label: binLabel(bin), ...bin };
    });
    const mapping = a21Mapping(library, 'perJoint', 'A2.1.xlsx');
    const cells = cellsOf(library, mapping);
    expect(cells.get('valve|manual|3" < x ≤ 6"')).toBe('C25');
    expect(cells.get('valve|manual|6" < x ≤ 11"')).toBe('C25');
    expect(cells.get('valve|manual|11" < x ≤ 16"')).toBe('C26');
    expect(cells.get('valve|manual|> 16"')).toBe('C26');
    expect(cells.has('valve|manual|1/2" < x ≤ 1-1/2"')).toBe(false);
    // Counts sharing a cell are added up, so they are not duplicates.
    expect(duplicateCells(mapping)).toEqual([]);
  });
});
