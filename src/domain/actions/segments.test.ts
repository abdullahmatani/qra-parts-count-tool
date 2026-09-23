import { describe, expect, it } from 'vitest';
import { docToProject, projectToDoc } from '../model';
import { newEsdvData } from '../esdv';
import { checkIntegrity } from '../schema';
import { makeCircleMarker, makeNote, makePopulatedProject } from '@/test/fixtures';
import { addMarker } from './markers';
import {
  createSegment,
  deleteSegment,
  isSegmentLabelTaken,
  linkDrawing,
  mergeSegments,
  moveSegment,
  nextSegmentLabel,
  segmentBoundsOnDrawing,
  segmentMarkerIds,
  splitSegment,
  unlinkDrawing,
  updateEsdv,
  updateSegment,
} from './segments';

function setup() {
  const doc = projectToDoc(makePopulatedProject());
  const drawingId = doc.drawingOrder[0]!;
  const segmentId = doc.segmentOrder[0]!;
  return { doc, drawingId, segmentId };
}

function addEsdv(doc: ReturnType<typeof setup>['doc'], drawingId: string, id = 'mkr_esdv') {
  addMarker(doc, makeCircleMarker(drawingId, { id, esdv: newEsdvData('in') }));
  return id;
}

describe('segment labels (SEG-02)', () => {
  it('suggests the next label, keeping prefix and padding', () => {
    const { doc } = setup();
    expect(nextSegmentLabel({ segments: {} })).toBe('IS-01');
    expect(nextSegmentLabel(doc)).toBe('IS-02');
    createSegment(doc, { label: 'IS-09' });
    expect(nextSegmentLabel(doc)).toBe('IS-10');
    createSegment(doc, { label: 'Flare header' });
    expect(nextSegmentLabel(doc)).toBe('IS-10');
  });

  it('compares labels without case or surrounding spaces', () => {
    const { doc, segmentId } = setup();
    expect(isSegmentLabelTaken(doc, ' is-01 ')).toBe(true);
    expect(isSegmentLabelTaken(doc, 'IS-01', segmentId)).toBe(false);
  });
});

describe('segment edits', () => {
  it('creates a segment with the next free colour at the end of the list', () => {
    const { doc } = setup();
    const id = createSegment(doc, { label: ' IS-02 ', fluid: 'Gas', pressure: 45 });
    expect(doc.segments[id]).toMatchObject({
      label: 'IS-02',
      colour: 2,
      fluid: 'Gas',
      pressure: 45,
    });
    expect(doc.segmentOrder.at(-1)).toBe(id);
  });

  it('updates only changed fields', () => {
    const { doc, segmentId } = setup();
    updateSegment(doc, segmentId, { description: 'Inlet', status: 'inProgress', label: 'IS-1A ' });
    expect(doc.segments[segmentId]).toMatchObject({
      description: 'Inlet',
      status: 'inProgress',
      label: 'IS-1A',
    });
  });

  it('links and unlinks drawings (SEG-04)', () => {
    const { doc, drawingId, segmentId } = setup();
    unlinkDrawing(doc, segmentId, drawingId);
    expect(doc.segments[segmentId]?.drawingIds).toEqual([]);
    linkDrawing(doc, segmentId, drawingId);
    linkDrawing(doc, segmentId, drawingId);
    linkDrawing(doc, segmentId, 'drw_missing');
    expect(doc.segments[segmentId]?.drawingIds).toEqual([drawingId]);
  });

  it("finds a segment's markers and their extent on a drawing (SEG-05)", () => {
    const { doc, drawingId, segmentId } = setup();
    expect(segmentMarkerIds(doc, segmentId, drawingId)).toHaveLength(2);
    expect(segmentBoundsOnDrawing(doc, segmentId, drawingId)).toEqual({
      minX: 88,
      minY: 88,
      maxX: 312,
      maxY: 212,
    });
    expect(segmentBoundsOnDrawing(doc, segmentId, 'drw_other')).toBeNull();
  });

  it('reorders segments (SEG-07)', () => {
    const { doc, segmentId } = setup();
    const b = createSegment(doc, { label: 'IS-02' });
    moveSegment(doc, b, 0);
    expect(doc.segmentOrder).toEqual([b, segmentId]);
  });
});

describe('deleting a segment', () => {
  it('moves markers, items, notes and ESDV sides to another segment', () => {
    const { doc, drawingId, segmentId } = setup();
    const target = createSegment(doc, { label: 'IS-02' });
    const esdv = addEsdv(doc, drawingId);
    updateEsdv(doc, esdv, { upstreamSegmentId: segmentId, downstreamSegmentId: target });
    doc.notes.not_1 = makeNote(segmentId);
    deleteSegment(doc, segmentId, { kind: 'moveTo', segmentId: target });
    expect(doc.segments[segmentId]).toBeUndefined();
    expect(Object.values(doc.markers).filter((m) => m.segmentId === target)).toHaveLength(2);
    expect(Object.values(doc.items).every((i) => i.segmentId === target)).toBe(true);
    expect(doc.notes.not_1?.segmentId).toBe(target);
    // Both sides became the same segment, so the ESDV keeps only one.
    expect(doc.markers[esdv]?.esdv).toMatchObject({
      upstreamSegmentId: target,
      downstreamSegmentId: null,
    });
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('or deletes its markers and notes, keeping boundary ESDVs', () => {
    const { doc, drawingId, segmentId } = setup();
    const esdv = addEsdv(doc, drawingId);
    updateEsdv(doc, esdv, { upstreamSegmentId: segmentId });
    doc.notes.not_1 = makeNote(segmentId);
    deleteSegment(doc, segmentId, { kind: 'deleteMarkers' });
    expect(Object.keys(doc.markers)).toEqual([esdv]);
    expect(doc.markers[esdv]?.esdv?.upstreamSegmentId).toBeNull();
    expect(Object.keys(doc.items)).toHaveLength(0);
    expect(doc.notes.not_1).toBeUndefined();
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('refuses to move markers to itself or a missing segment', () => {
    const { doc, segmentId } = setup();
    deleteSegment(doc, segmentId, { kind: 'moveTo', segmentId });
    deleteSegment(doc, segmentId, { kind: 'moveTo', segmentId: 'seg_missing' });
    expect(doc.segments[segmentId]).toBeDefined();
  });
});

describe('ESDVs (SEG-01, SEG-03)', () => {
  it('keeps bounding ESDV lists in step with the ESDV sides', () => {
    const { doc, drawingId, segmentId } = setup();
    const other = createSegment(doc, { label: 'IS-02' });
    const a = addEsdv(doc, drawingId, 'mkr_a');
    const b = addEsdv(doc, drawingId, 'mkr_b');
    updateEsdv(doc, a, {
      tag: 'ESDV-101',
      upstreamSegmentId: segmentId,
      downstreamSegmentId: other,
    });
    updateEsdv(doc, b, { downstreamSegmentId: segmentId });
    expect(doc.segments[segmentId]?.boundingEsdvIds).toEqual([a, b]);
    expect(doc.segments[other]?.boundingEsdvIds).toEqual([a]);
    expect(doc.segments[other]?.drawingIds).toEqual([drawingId]);
    updateEsdv(doc, a, { downstreamSegmentId: null });
    expect(doc.segments[other]?.boundingEsdvIds).toEqual([]);
  });

  it('never puts the same segment on both sides', () => {
    const { doc, drawingId, segmentId } = setup();
    const a = addEsdv(doc, drawingId);
    updateEsdv(doc, a, { upstreamSegmentId: segmentId });
    updateEsdv(doc, a, { downstreamSegmentId: segmentId });
    expect(doc.markers[a]?.esdv).toMatchObject({
      upstreamSegmentId: null,
      downstreamSegmentId: segmentId,
    });
  });

  it('ignores markers that are not ESDVs and unknown segments', () => {
    const { doc, drawingId } = setup();
    const plain = Object.keys(doc.markers)[0]!;
    updateEsdv(doc, plain, { tag: 'X' });
    expect(doc.markers[plain]?.esdv).toBeNull();
    const a = addEsdv(doc, drawingId);
    updateEsdv(doc, a, { upstreamSegmentId: 'seg_missing' });
    expect(doc.markers[a]?.esdv?.upstreamSegmentId).toBeNull();
  });
});

describe('split and merge (SEG-07)', () => {
  it('splits markers into a new segment after the original, with the same process data', () => {
    const { doc, segmentId } = setup();
    updateSegment(doc, segmentId, { fluid: 'Gas', pressure: 45 });
    const other = createSegment(doc, { label: 'IS-09' });
    const [m1, m2] = Object.keys(doc.markers);
    const esdv = addEsdv(doc, doc.drawingOrder[0]!);
    const id = splitSegment(doc, segmentId, [m2!, esdv], 'IS-02')!;
    expect(doc.segmentOrder).toEqual([segmentId, id, other]);
    expect(doc.segments[id]).toMatchObject({ label: 'IS-02', fluid: 'Gas', pressure: 45 });
    expect(doc.markers[m1!]!.segmentId).toBe(segmentId);
    expect(doc.markers[m2!]!.segmentId).toBe(id);
    // Its item follows; the ESDV keeps its own sides.
    expect(Object.values(doc.items).find((i) => i.markerId === m2)!.segmentId).toBe(id);
    expect(doc.markers[esdv]!.segmentId).toBeNull();
    expect(doc.segments[id]!.drawingIds).toEqual([doc.drawingOrder[0]]);
    // Nothing to move: no split.
    expect(splitSegment(doc, other, [m1!], 'IS-03')).toBeNull();
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('merges a segment into another with its drawings, notes and ESDV boundary', () => {
    const { doc, segmentId } = setup();
    const [, m2] = Object.keys(doc.markers);
    const id = splitSegment(doc, segmentId, [m2!], 'IS-02')!;
    const extraDrawing = doc.drawingOrder[0]!;
    doc.notes.not_1 = makeNote(id, { id: 'not_1' });
    const esdv = addEsdv(doc, extraDrawing);
    updateEsdv(doc, esdv, { upstreamSegmentId: segmentId, downstreamSegmentId: id });
    expect(doc.segments[segmentId]!.boundingEsdvIds).toEqual([esdv]);

    mergeSegments(doc, id, segmentId);
    expect(doc.segmentOrder).toEqual([segmentId]);
    expect(doc.markers[m2!]!.segmentId).toBe(segmentId);
    expect(doc.notes.not_1!.segmentId).toBe(segmentId);
    // The ESDV between the two is inside the merged segment now: no longer a boundary.
    expect(doc.markers[esdv]!.esdv).toMatchObject({
      upstreamSegmentId: segmentId,
      downstreamSegmentId: null,
    });
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });
});
