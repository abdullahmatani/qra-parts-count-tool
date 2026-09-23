import { describe, expect, it } from 'vitest';
import { starterLibrary } from '../count/starter-library';
import { projectToDoc } from '../model';
import { makeCircleMarker, makeDrawing, makeProject } from '@/test/fixtures';
import { newEsdvData } from '../esdv';
import { addItem, itemForMarker, updateItem, updateItems } from './items';
import { addMarker } from './markers';

function setup() {
  const library = starterLibrary();
  const drawing = makeDrawing({ id: 'drw_1' });
  const marker = makeCircleMarker('drw_1', { id: 'mkr_1', segmentId: null });
  const doc = projectToDoc(makeProject({ drawings: [drawing], markers: [marker], library }));
  const valve = library.equipmentTypes[0]!.id;
  const pump = library.equipmentTypes.find((t) => t.category === 'pump')!.id;
  return { doc, valve, pump };
}

describe('count items (CNT-01, CNT-03)', () => {
  it('adds one item per marker with the last-used type and the next number', () => {
    const { doc, valve } = setup();
    const id = addItem(doc, 'mkr_1', { equipmentTypeId: valve, actuation: 'automated' })!;
    expect(doc.items[id]).toMatchObject({
      seq: 1,
      markerId: 'mkr_1',
      drawingId: 'drw_1',
      equipmentTypeId: valve,
      actuation: 'automated',
      quantity: 1,
      sizeUnit: 'in',
    });
    expect(doc.nextItemSeq).toBe(2);
    expect(itemForMarker(doc, 'mkr_1')?.id).toBe(id);
    expect(addItem(doc, 'mkr_1', { equipmentTypeId: null, actuation: null })).toBeNull();
  });

  it('never adds an item to an ESDV or a missing marker', () => {
    const { doc } = setup();
    doc.markers.mkr_1!.esdv = newEsdvData('in');
    expect(addItem(doc, 'mkr_1', { equipmentTypeId: null, actuation: null })).toBeNull();
    expect(addItem(doc, 'nope', { equipmentTypeId: null, actuation: null })).toBeNull();
  });

  it('ignores unknown default types and actuation on types without it', () => {
    const { doc, pump } = setup();
    const id = addItem(doc, 'mkr_1', { equipmentTypeId: pump, actuation: 'manual' })!;
    expect(doc.items[id]).toMatchObject({ equipmentTypeId: pump, actuation: null });
  });

  it('updates fields, clearing actuation when the type has none', () => {
    const { doc, valve, pump } = setup();
    const id = addItem(doc, 'mkr_1', { equipmentTypeId: valve, actuation: 'manual' })!;
    updateItem(doc, id, { nominalSize: 2, tag: 'HV-1', quantity: 2.6 });
    expect(doc.items[id]).toMatchObject({ nominalSize: 2, tag: 'HV-1', quantity: 3 });
    updateItem(doc, id, { quantity: 0, nominalSize: -1, pipeLength: -5 });
    expect(doc.items[id]).toMatchObject({ quantity: 1, nominalSize: 2, pipeLength: null });
    updateItem(doc, id, { equipmentTypeId: pump });
    expect(doc.items[id]?.actuation).toBeNull();
  });
});

describe('bulk edit (CNT-10)', () => {
  it('changes one field on several items and leaves the rest', () => {
    const { doc, valve, pump } = setup();
    addMarker(doc, makeCircleMarker('drw_1', { id: 'mkr_2', segmentId: null }));
    const a = addItem(doc, 'mkr_1', { equipmentTypeId: valve, actuation: 'manual' })!;
    const b = addItem(doc, 'mkr_2', { equipmentTypeId: pump, actuation: null })!;
    updateItem(doc, a, { tag: 'HV-1', nominalSize: 2 });

    updateItems(doc, [a, b], { nominalSize: 6, sizeUnit: 'in' });
    expect(doc.items[a]).toMatchObject({ nominalSize: 6, tag: 'HV-1', actuation: 'manual' });
    expect(doc.items[b]).toMatchObject({ nominalSize: 6, equipmentTypeId: pump });

    // A type change keeps actuation only where the new type has one.
    updateItems(doc, [a, b], { equipmentTypeId: valve, actuation: 'automated' });
    expect(doc.items[b]).toMatchObject({ equipmentTypeId: valve, actuation: 'automated' });
    updateItems(doc, [a, b], { equipmentTypeId: pump });
    expect(doc.items[a]!.actuation).toBeNull();
  });
});
