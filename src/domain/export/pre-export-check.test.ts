import { describe, expect, it } from 'vitest';
import { countEntries } from '../count/count';
import { starterLibrary } from '../count/starter-library';
import { projectToDoc } from '../model';
import { makeCircleMarker, makeDrawing, makeItem, makeProject, makeSegment } from '@/test/fixtures';
import { checkPassed, preExportCheck } from './pre-export-check';

function setup() {
  const library = starterLibrary();
  const pump = library.equipmentTypes.find((t) => t.category === 'pump')!.id;
  const drawing = makeDrawing({ id: 'drw_1' });
  const a = makeSegment({ id: 'seg_a', label: 'IS-01', drawingIds: ['drw_1'] });
  const b = makeSegment({ id: 'seg_b', label: 'IS-02', colour: 2 });
  const m1 = makeCircleMarker('drw_1', { id: 'mkr_1', segmentId: 'seg_a' });
  const m2 = makeCircleMarker('drw_1', { id: 'mkr_2', segmentId: 'seg_a' });
  const m3 = makeCircleMarker('drw_1', { id: 'mkr_3', segmentId: null });
  const items = [
    makeItem(m1, 1, { equipmentTypeId: pump, tag: 'P-1' }),
    makeItem(m2, 2, { equipmentTypeId: pump, tag: 'p 1' }),
    makeItem(m3, 3, { equipmentTypeId: null }),
  ];
  const doc = projectToDoc(
    makeProject({
      drawings: [drawing],
      segments: [a, b],
      markers: [m1, m2, m3],
      items,
      library,
      nextItemSeq: 4,
    }),
  );
  return doc;
}

describe('pre-export check (EXP-01)', () => {
  it('lists unassigned markers, incomplete items, empty and unlinked segments and duplicates', () => {
    const doc = setup();
    const results = preExportCheck(doc, countEntries(doc));
    const byKind = Object.fromEntries(results.map((r) => [r.kind, r]));
    expect(byKind.unassignedMarkers).toMatchObject({ count: 1, markerIds: ['mkr_3'] });
    expect(byKind.incompleteItems).toMatchObject({ count: 1, markerIds: ['mkr_3'] });
    expect(byKind.emptySegments).toMatchObject({ count: 1, names: ['IS-02'] });
    expect(byKind.segmentsWithoutDrawings).toMatchObject({ count: 1, names: ['IS-02'] });
    expect(byKind.duplicateTags).toMatchObject({ count: 1, names: ['P-1'] });
    expect(checkPassed(results)).toBe(false);
  });

  it('passes a clean project', () => {
    const doc = setup();
    delete doc.markers.mkr_3;
    delete doc.items[Object.keys(doc.items)[2]!];
    doc.segments.seg_b!.drawingIds = ['drw_1'];
    doc.markers.mkr_2!.segmentId = 'seg_b';
    Object.values(doc.items)[1]!.segmentId = 'seg_b';
    doc.acceptedDuplicates.push({ tag: 'P-1', note: '', acceptedAt: new Date().toISOString() });
    expect(checkPassed(preExportCheck(doc, countEntries(doc)))).toBe(true);
    // Counts with no template cell are listed when a template is mapped.
    const withTemplate = preExportCheck(doc, countEntries(doc), {
      unmappedCounts: ['IS-01: Pump, any size'],
    });
    expect(withTemplate.at(-1)).toMatchObject({ kind: 'unmappedCounts', count: 1 });
    expect(checkPassed(withTemplate)).toBe(false);
  });
});
