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
  moveSegment,
  nextSegmentLabel,
  segmentBoundsOnDrawing,
  segmentMarkerIds,
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
