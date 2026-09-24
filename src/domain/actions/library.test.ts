import { describe, expect, it } from 'vitest';
import { starterLibrary } from '../count/starter-library';
import { projectToDoc } from '../model';
import { checkIntegrity } from '../schema';
import { docToProject } from '../model';
import { makeCircleMarker, makeDrawing, makeItem, makeProject } from '@/test/fixtures';
import {
  addBin,
  addBinSet,
  addEquipmentType,
  addStarterLibrary,
  deleteBin,
  deleteBinSet,
  deleteEquipmentType,
  moveEquipmentType,
  renameBinSet,
  setEsdvEquipmentType,
  updateBin,
  updateDataset,
  updateEquipmentType,
} from './library';

function setup(library = starterLibrary()) {
  const drawing = makeDrawing({ id: 'drw_1' });
  const marker = makeCircleMarker('drw_1', { id: 'mkr_1' });
  const valve = library.equipmentTypes[0]?.id ?? null;
  const item = makeItem(marker, 1, { id: 'itm_1', equipmentTypeId: valve, actuation: 'manual' });
  const doc = projectToDoc(
    makeProject({ drawings: [drawing], markers: [marker], items: [item], library, nextItemSeq: 2 }),
  );
  return { doc, valve: valve! };
}

describe('equipment types (CNT-02)', () => {
  it('adds, edits, reorders and deletes types', () => {
    const { doc, valve } = setup();
    const id = addEquipmentType(doc, { name: 'Instrument', category: 'instrument' });
    updateEquipmentType(doc, id, { datasetCategory: 'Instrument', excelKey: 'inst' });
    expect(doc.library.equipmentTypes.at(-1)).toMatchObject({
      name: 'Instrument',
      datasetCategory: 'Instrument',
    });
    moveEquipmentType(doc, id, 0);
    expect(doc.library.equipmentTypes[0]!.id).toBe(id);
    deleteEquipmentType(doc, valve);
    expect(doc.items.itm_1).toMatchObject({ equipmentTypeId: null, actuation: null });
    expect(doc.library.esdvEquipmentTypeId).toBeNull();
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('keeps shortcut keys unique (ANN-08)', () => {
    const { doc, valve } = setup();
    const flange = doc.library.equipmentTypes[1]!.id;
    updateEquipmentType(doc, flange, { shortcut: '1' });
    expect(doc.library.equipmentTypes.find((t) => t.id === valve)?.shortcut).toBeNull();
  });

  it('clears item actuation when a type stops having it (CNT-03)', () => {
    const { doc, valve } = setup();
    updateEquipmentType(doc, valve, { hasActuation: false });
    expect(doc.items.itm_1?.actuation).toBeNull();
  });

  it('sets the ESDV type only to an existing type', () => {
    const { doc } = setup();
    setEsdvEquipmentType(doc, 'eqt_missing');
    expect(doc.library.esdvEquipmentTypeId).not.toBe('eqt_missing');
    setEsdvEquipmentType(doc, null);
    expect(doc.library.esdvEquipmentTypeId).toBeNull();
  });

  it('names the dataset (CNT-02)', () => {
    const { doc } = setup();
    updateDataset(doc, { datasetName: 'IOGP 434-01', datasetDescription: 'Release frequencies' });
    expect(doc.library).toMatchObject({ datasetName: 'IOGP 434-01' });
  });
});

describe('bin sets (CNT-04)', () => {
  it('copies, renames and deletes bin sets', () => {
    const { doc } = setup();
    const source = doc.library.binSets[0]!;
    const id = addBinSet(doc, 'Instrument valves', source.id);
    const copy = doc.library.binSets.find((b) => b.id === id)!;
    expect(copy.bins.map((b) => b.label)).toEqual(source.bins.map((b) => b.label));
    expect(copy.bins[0]!.id).not.toBe(source.bins[0]!.id);
    renameBinSet(doc, id, '  Small valves ');
    expect(copy.name).toBe('Small valves');
    deleteBinSet(doc, source.id);
    const valve = doc.library.equipmentTypes[0]!;
    expect(valve.actuationBinSetIds.automated).toBeNull();
  });

  it('adds bins that continue from the last edge and relabels on edge changes', () => {
    const { doc } = setup();
    const id = addBinSet(doc, 'Custom');
    const first = addBin(doc, id)!;
    updateBin(doc, id, first, { upper: 2 });
    const second = addBin(doc, id)!;
    const bins = doc.library.binSets.find((b) => b.id === id)!.bins;
    expect(bins.map((b) => b.label)).toEqual(['≤ 2"', '> 2"']);
    updateBin(doc, id, second, { label: 'Large' });
    expect(bins[1]!.label).toBe('Large');
    deleteBin(doc, id, first);
    expect(bins).toHaveLength(2);
    expect(doc.library.binSets.find((b) => b.id === id)!.bins).toHaveLength(1);
  });
});

describe('starter library', () => {
  it('fills an empty library and skips types already present', () => {
    const { doc } = setup({
      datasetName: '',
      datasetDescription: '',
      equipmentTypes: [],
      binSets: [],
      esdvEquipmentTypeId: null,
    });
    expect(addStarterLibrary(doc)).toBe(18);
    expect(doc.library.esdvEquipmentTypeId).not.toBeNull();
    expect(addStarterLibrary(doc)).toBe(0);
    expect(checkIntegrity(docToProject(doc)).filter((i) => i.code !== 'danglingType')).toEqual([]);
  });
});
