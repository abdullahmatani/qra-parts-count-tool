import { describe, expect, it } from 'vitest';
import { addEquipmentType } from '../actions/library';
import { starterLibrary } from '../count/starter-library';
import {
  autoFillCountCells,
  countRowKeys,
  defaultMapping,
  duplicateCells,
  formatCellList,
  fromPortableMapping,
  isCellRef,
  parseCellList,
  toPortableMapping,
} from './mapping';

describe('template mapping helpers', () => {
  it('recognises cell references', () => {
    expect(['D14', '$D$14', 'd', 'AB7'].map(isCellRef)).toEqual([true, true, true, true]);
    expect(['14', 'D-4', 'ABCD1', ''].map(isCellRef)).toEqual([false, false, false, false]);
  });

  it('lists count rows with automated before manual valves, without pipe', () => {
    const library = starterLibrary();
    const rows = countRowKeys(library);
    expect(rows.slice(0, 2).map((r) => r.actuation)).toEqual(['automated', 'manual']);
    const pipe = library.equipmentTypes.find((t) => t.category === 'pipe')!;
    expect(rows.some((r) => r.equipmentTypeId === pipe.id)).toBe(false);
  });

  it('auto-fills a block: types down, bins across', () => {
    const library = starterLibrary();
    const cells = autoFillCountCells(library, 'C10');
    expect(cells.slice(0, 6).map((c) => c.cell)).toEqual([
      'C10',
      'D10',
      'E10',
      'F10',
      'G10',
      'C11',
    ]);
    expect(cells[5]!.actuation).toBe('manual');
  });

  it('finds cells mapped twice', () => {
    const mapping = {
      ...defaultMapping('t.xlsx', 'Sheet1'),
      headerFields: { segmentLabel: 'B2', fluid: '$B$2' },
      notesCell: 'B30',
    };
    expect(duplicateCells(mapping)).toEqual(['B2']);
  });
});

describe('portable mapping file (#39)', () => {
  it('round-trips through another project with the same library', () => {
    const source = starterLibrary();
    const mapping = {
      ...defaultMapping('client.xlsx', 'Master'),
      headerFields: { segmentLabel: 'B2' },
      countCells: autoFillCountCells(source, 'C10'),
      notesCell: 'B40',
    };
    const portable = toPortableMapping(mapping, source);
    expect(portable.countCells[0]).toEqual({
      type: 'valve',
      actuation: 'automated',
      bin: '≤ 1"',
      cell: 'C10',
    });
    // A second project has its own ids for the same types and bins.
    const target = starterLibrary();
    const { mapping: imported, unresolved } = fromPortableMapping(
      JSON.parse(JSON.stringify(portable)),
      target,
      'client.xlsx',
    );
    expect(unresolved).toEqual([]);
    expect(imported.countCells).toHaveLength(mapping.countCells.length);
    expect(imported.countCells[0]!.equipmentTypeId).toBe(target.equipmentTypes[0]!.id);
    expect(imported.notesCell).toBe('B40');
  });

  it('reports cells it cannot place', () => {
    const source = starterLibrary();
    const doc = { library: source, items: {} };
    const custom = addEquipmentType(doc, {
      name: 'Sampling point',
      binSetId: source.binSets[0]!.id,
    });
    const mapping = {
      ...defaultMapping('client.xlsx', 'Master'),
      countCells: [
        {
          equipmentTypeId: custom,
          actuation: null,
          binId: source.binSets[0]!.bins[0]!.id,
          cell: 'D5',
        },
      ],
    };
    const { unresolved } = fromPortableMapping(
      toPortableMapping(mapping, source),
      starterLibrary(),
      'x.xlsx',
    );
    expect(unresolved).toEqual(['Sampling point ≤ 1" → D5']);
    expect(() =>
      fromPortableMapping({ kind: 'other' } as never, starterLibrary(), 'x.xlsx'),
    ).toThrow();
  });
});

describe('cell lists for notes lines', () => {
  it('reads a range down one column or a list, and shows runs as a range', () => {
    expect(parseCellList('b72:b77')).toEqual(['B72', 'B73', 'B74', 'B75', 'B76', 'B77']);
    expect(parseCellList('B72, $B$74')).toEqual(['B72', 'B74']);
    expect(parseCellList('')).toEqual([]);
    expect(parseCellList('B72:C77')).toBeNull();
    expect(parseCellList('B77:B72')).toBeNull();
    expect(parseCellList('notes')).toBeNull();
    expect(formatCellList(['B72', 'B73', 'B74'])).toBe('B72:B74');
    expect(formatCellList(['B72', 'B74'])).toBe('B72, B74');
    expect(formatCellList(['B72'])).toBe('B72');
  });

  it('keeps notes lines in the portable mapping file', () => {
    const library = starterLibrary();
    const source = {
      ...defaultMapping('t.xlsx', 'Sheet1'),
      notesLines: ['B72', 'B73'],
      notesLineLength: 80,
    };
    const { mapping } = fromPortableMapping(toPortableMapping(source, library), library, 't.xlsx');
    expect(mapping.notesLines).toEqual(['B72', 'B73']);
    expect(mapping.notesLineLength).toBe(80);
    const old = { ...toPortableMapping(source, library) } as Partial<
      ReturnType<typeof toPortableMapping>
    >;
    delete old.notesLines;
    delete old.notesLineLength;
    const fromOld = fromPortableMapping(
      old as ReturnType<typeof toPortableMapping>,
      library,
      't.xlsx',
    );
    expect(fromOld.mapping.notesLines).toEqual([]);
    expect(fromOld.mapping.notesLineLength).toBe(90);
  });
});
