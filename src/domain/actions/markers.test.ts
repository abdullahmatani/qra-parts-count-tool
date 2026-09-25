import { describe, expect, it } from 'vitest';
import { docToProject, projectToDoc } from '../model';
import { checkIntegrity } from '../schema';
import { makeCircleMarker, makeItem, makePopulatedProject, makeSegment } from '@/test/fixtures';
import {
  addMarker,
  assignMarkers,
  copyMarkers,
  deleteMarkers,
  moveMarkers,
  pasteMarkers,
  setMarkerGeometry,
  setMarkerSymbol,
} from './markers';
import { newEsdvData } from '../esdv';
import { DOT_SCALE } from '../markup/geometry';

function setup() {
  const doc = projectToDoc(makePopulatedProject());
  const drawingId = doc.drawingOrder[0]!;
  const segmentId = doc.segmentOrder[0]!;
  return { doc, drawingId, segmentId };
}

describe('marker actions', () => {
  it('adds a marker and links its segment to the drawing (SEG-04)', () => {
    const { doc, drawingId } = setup();
    const segment = makeSegment({ id: 'seg_new', label: 'IS-09' });
    doc.segments[segment.id] = segment;
    doc.segmentOrder.push(segment.id);
    addMarker(doc, makeCircleMarker(drawingId, { id: 'mkr_new', segmentId: segment.id }));
    expect(doc.markers.mkr_new).toBeDefined();
    expect(doc.segments.seg_new?.drawingIds).toEqual([drawingId]);
  });

  it('moves markers by a distance', () => {
    const { doc } = setup();
    const ids = Object.keys(doc.markers);
    moveMarkers(doc, ids, 10, -5);
    expect(doc.markers[ids[0]!]?.geometry).toMatchObject({ cx: 110, cy: 95 });
  });

  it('replaces geometry but never changes the shape', () => {
    const { doc } = setup();
    const id = Object.keys(doc.markers)[0]!;
    setMarkerGeometry(doc, id, { type: 'circle', cx: 1, cy: 2, r: 3 });
    expect(doc.markers[id]?.geometry).toEqual({ type: 'circle', cx: 1, cy: 2, r: 3 });
    setMarkerGeometry(doc, id, { type: 'rect', x: 0, y: 0, width: 1, height: 1 });
    expect(doc.markers[id]?.geometry.type).toBe('circle');
  });

  it('redraws equipment circles as dots or squares, but leaves ESDVs and highlights alone', () => {
    const { doc, drawingId } = setup();
    addMarker(doc, makeCircleMarker(drawingId, { id: 'ring' }));
    addMarker(
      doc,
      makeCircleMarker(drawingId, {
        id: 'outline',
        style: {
          labelOffset: null,
          symbol: 'freeform',
          outline: [
            [0, -1],
            [1, 0],
            [0, 1],
          ],
        },
      }),
    );
    addMarker(doc, makeCircleMarker(drawingId, { id: 'esdv', esdv: newEsdvData('in') }));
    addMarker(
      doc,
      makeCircleMarker(drawingId, {
        id: 'area',
        shape: 'dashedHighlight',
        geometry: { type: 'rect', x: 0, y: 0, width: 5, height: 5 },
      }),
    );
    setMarkerSymbol(doc, ['ring', 'outline', 'esdv', 'area'], 'dot');
    // A dot is smaller than the ring around the same symbol.
    expect(doc.markers.ring?.style.symbol).toBe('dot');
    expect(doc.markers.ring?.geometry).toMatchObject({ r: 12 * DOT_SCALE });
    expect(doc.markers.outline?.style).toMatchObject({ symbol: 'dot', outline: null });
    expect(doc.markers.esdv?.style.symbol).toBe('circle');
    expect(doc.markers.area?.style.symbol).toBe('circle');
    setMarkerSymbol(doc, ['ring'], 'square');
    expect(doc.markers.ring?.geometry.type === 'circle' && doc.markers.ring.geometry.r).toBeCloseTo(
      12,
    );
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('assigns markers and their items to a segment, or unassigns them (ANN-03)', () => {
    const { doc } = setup();
    const ids = Object.keys(doc.markers);
    assignMarkers(doc, ids, null);
    expect(Object.values(doc.markers).every((m) => m.segmentId === null)).toBe(true);
    expect(Object.values(doc.items).every((i) => i.segmentId === null)).toBe(true);
    assignMarkers(doc, ids, 'seg_missing');
    expect(Object.values(doc.markers).every((m) => m.segmentId === null)).toBe(true);
  });

  it('deletes markers with their items', () => {
    const { doc } = setup();
    deleteMarkers(doc, Object.keys(doc.markers));
    expect(Object.keys(doc.items)).toHaveLength(0);
  });
});

describe('copy and paste (ANN-04)', () => {
  it('pastes copies with new ids, new item numbers and an offset', () => {
    const { doc, drawingId } = setup();
    const ids = Object.keys(doc.markers);
    const clip = copyMarkers(doc, ids)!;
    const before = doc.nextItemSeq;
    const pasted = pasteMarkers(doc, clip, drawingId, { x: 20, y: 0 });
    expect(pasted).toHaveLength(2);
    expect(pasted.some((id) => ids.includes(id))).toBe(false);
    const copy = doc.markers[pasted[0]!]!;
    expect(copy.geometry).toMatchObject({ cx: 120, cy: 100 });
    const items = Object.values(doc.items).filter((i) => pasted.includes(i.markerId));
    expect(items.map((i) => i.seq).sort()).toEqual([before, before + 1]);
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('keeps pasted markers independent of the clipboard', () => {
    const { doc, drawingId } = setup();
    const clip = copyMarkers(doc, Object.keys(doc.markers))!;
    const [id] = pasteMarkers(doc, clip, drawingId, { x: 0, y: 0 });
    moveMarkers(doc, [id!], 5, 5);
    expect(clip.markers[0]?.geometry).toMatchObject({ cx: 100, cy: 100 });
  });

  it('drops segments that no longer exist', () => {
    const { doc, drawingId, segmentId } = setup();
    const marker = makeCircleMarker(drawingId, { segmentId });
    addMarker(doc, marker);
    doc.items.itm_x = makeItem(marker, 99);
    const clip = copyMarkers(doc, [marker.id])!;
    delete doc.segments[segmentId];
    doc.segmentOrder = [];
    const [id] = pasteMarkers(doc, clip, drawingId, { x: 0, y: 0 });
    expect(doc.markers[id!]?.segmentId).toBeNull();
    expect(Object.values(doc.items).find((i) => i.markerId === id)?.segmentId).toBeNull();
  });

  it('returns nothing to copy for unknown ids', () => {
    const { doc } = setup();
    expect(copyMarkers(doc, ['nope'])).toBeNull();
  });
});
