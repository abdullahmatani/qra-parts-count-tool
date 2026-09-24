import { describe, expect, it } from 'vitest';
import { starterLibrary } from './count/starter-library';
import { LibraryFileError, mergeLibrary, parseLibraryFile, toLibraryFile } from './library-file';
import { Library as LibrarySchema } from './schema/v1';

const now = new Date('2026-09-23T10:00:00Z');

describe('library files (CNT-11)', () => {
  it('round-trips through a file', () => {
    const library = starterLibrary();
    const text = JSON.stringify(toLibraryFile(library, now));
    expect(parseLibraryFile(text)).toEqual(library);
  });

  it('rejects files that are not library files', () => {
    expect(() => parseLibraryFile('not json')).toThrow(LibraryFileError);
    expect(() => parseLibraryFile('{"format":"other"}')).toThrow(/not an equipment library/);
    expect(() =>
      parseLibraryFile(JSON.stringify({ format: 'qrapc-library', version: 2, library: {} })),
    ).toThrow(/version 2/);
    expect(() =>
      parseLibraryFile(
        JSON.stringify({
          format: 'qrapc-library',
          version: 1,
          library: { equipmentTypes: [{ id: 'eqt_1', name: '', category: 'valve' }] },
        }),
      ),
    ).toThrow(/not valid/);
  });

  it('merges by Excel key and name, keeping the project ids items and mappings use', () => {
    const current = starterLibrary();
    const incoming = starterLibrary(); // same names, different ids
    const valveIn = incoming.equipmentTypes.find((t) => t.category === 'valve')!;
    valveIn.datasetCategory = 'Valve (IOGP)';
    valveIn.shortcut = '9';
    const flangesIn = incoming.binSets.find((s) => s.name === 'Flanges')!;
    flangesIn.bins.push({
      id: 'bin_new',
      label: '> 24"',
      lower: 24,
      lowerInclusive: false,
      upper: null,
      upperInclusive: false,
    });
    incoming.equipmentTypes.push({
      ...incoming.equipmentTypes.find((t) => t.category === 'pump')!,
      id: 'eqt_new',
      name: 'Turbine',
      excelKey: 'turbine',
      shortcut: '1', // clashes with Valve's key in the project
    });
    incoming.datasetName = 'IOGP 434-01';

    const { library, summary } = mergeLibrary(current, incoming);
    expect(LibrarySchema.parse(library)).toEqual(library);
    expect(summary).toEqual({
      typesAdded: 1,
      typesUpdated: 18,
      binSetsAdded: 0,
      binSetsUpdated: 6,
    });
    const valve = library.equipmentTypes.find((t) => t.category === 'valve')!;
    const valveBefore = current.equipmentTypes.find((t) => t.category === 'valve')!;
    expect(valve.id).toBe(valveBefore.id);
    expect(valve).toMatchObject({ datasetCategory: 'Valve (IOGP)', shortcut: '9' });
    // Bin sets keep their ids and bins keep theirs by label; references are remapped.
    const flanges = library.binSets.find((s) => s.name === 'Flanges')!;
    const flangesBefore = current.binSets.find((s) => s.name === 'Flanges')!;
    expect(flanges.id).toBe(flangesBefore.id);
    expect(flanges.bins.slice(0, -1).map((b) => b.id)).toEqual(flangesBefore.bins.map((b) => b.id));
    expect(flanges.bins).toHaveLength(flangesBefore.bins.length + 1);
    const ids = new Set(library.binSets.map((s) => s.id));
    for (const type of library.equipmentTypes) {
      if (type.binSetId) expect(ids.has(type.binSetId)).toBe(true);
    }
    // The imported key wins; no two types share a key.
    const turbine = library.equipmentTypes.find((t) => t.name === 'Turbine')!;
    expect(turbine.shortcut).toBe('1');
    const keys = library.equipmentTypes.map((t) => t.shortcut).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    expect(library.datasetName).toBe('IOGP 434-01');
    expect(library.esdvEquipmentTypeId).toBe(valveBefore.id);
  });

  it('keeps project types the file does not have', () => {
    const current = starterLibrary();
    const incoming = { ...starterLibrary(), equipmentTypes: [], binSets: [] };
    const { library } = mergeLibrary(current, incoming);
    expect(library.equipmentTypes).toEqual(current.equipmentTypes);
  });
});
