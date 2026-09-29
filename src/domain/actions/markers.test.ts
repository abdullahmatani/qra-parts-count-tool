import { describe, expect, it } from 'vitest';
import { docToProject, projectToDoc } from '../model';
import { checkIntegrity } from '../schema';
import {
  makeCircleMarker,
  makeDrawing,
  makeItem,
  makePopulatedProject,
  makeSegment,
} from '@/test/fixtures';
import type { Marker, StrokeGeometry } from '../schema/types';
import {
  addMarker,
  assignMarkers,
  copyMarkers,
  cutStrokesAtBoundary,
  deleteMarkers,
  moveMarkers,
  pasteMarkers,
  setMarkerGeometry,
  setMarkerSymbol,
  strokeAtBoundaries,
  updateEndFlange,
} from './markers';
import { newEndFlangeData } from '../end-flange';
import { newEsdvData } from '../esdv';
import { doubleLine } from '../markup/esdv-boundary';
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

describe('ESDVs cut highlighter strokes (SEG-01)', () => {
  /** A pipe run along y = 500, highlighted with a 10-unit pen. */
  const pipe = (): StrokeGeometry => ({
    type: 'stroke',
    points: [
      [0, 500],
      [400, 500],
    ],
    width: 10,
  });
  const highlight = (drawingId: string, id: string, segmentId: string | null): Marker =>
    makeCircleMarker(drawingId, { id, segmentId, shape: 'highlighter', geometry: pipe() });
  const esdv = (drawingId: string): Marker =>
    makeCircleMarker(drawingId, {
      id: 'esdv',
      shape: 'doubleLine',
      geometry: doubleLine({ x: 200, y: 480 }, { x: 200, y: 520 }, 6),
      esdv: newEsdvData('in'),
    });

  it('cuts the strokes an ESDV crosses into a piece on each side, in the same segment', () => {
    const { doc, drawingId, segmentId } = setup();
    const other = makeDrawing({ id: 'drw_other' });
    doc.drawings[other.id] = other;
    doc.drawingOrder.push(other.id);
    addMarker(doc, highlight(drawingId, 'hl', segmentId));
    addMarker(doc, highlight(other.id, 'elsewhere', segmentId));
    addMarker(doc, {
      ...highlight(drawingId, 'beside', null),
      geometry: { ...pipe(), points: pipe().points.map(([x, y]) => [x, y + 100]) },
    });
    addMarker(doc, esdv(drawingId));

    const added = cutStrokesAtBoundary(doc, 'esdv');
    expect(added).toHaveLength(1);
    // The paint stops at the double line: gap 3 plus half the pen either side.
    expect(doc.markers.hl!.geometry).toEqual({
      type: 'stroke',
      points: [
        [0, 500],
        [192, 500],
      ],
      width: 10,
    });
    expect(doc.markers[added[0]!]).toMatchObject({
      drawingId,
      segmentId,
      shape: 'highlighter',
      esdv: null,
      endFlange: null,
      geometry: {
        points: [
          [208, 500],
          [400, 500],
        ],
        width: 10,
      },
    });
    // Strokes on other drawings, or clear of the ESDV, are left alone.
    expect(doc.markers.elsewhere!.geometry).toEqual(pipe());
    expect((doc.markers.beside!.geometry as StrokeGeometry).points).toHaveLength(2);
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('only cuts at ESDVs', () => {
    const { doc, drawingId } = setup();
    addMarker(doc, highlight(drawingId, 'hl', null));
    // An equipment ring on the pipe is not a boundary.
    addMarker(
      doc,
      makeCircleMarker(drawingId, {
        id: 'valve',
        geometry: { type: 'circle', cx: 200, cy: 500, r: 12 },
      }),
    );
    expect(cutStrokesAtBoundary(doc, 'valve')).toEqual([]);
    expect(cutStrokesAtBoundary(doc, 'missing')).toEqual([]);
    expect(doc.markers.hl!.geometry).toEqual(pipe());
  });

  it('cuts at end flanges as at ESDVs', () => {
    const { doc, drawingId, segmentId } = setup();
    addMarker(doc, highlight(drawingId, 'hl', segmentId));
    addMarker(
      doc,
      makeCircleMarker(drawingId, {
        id: 'flange',
        segmentId,
        shape: 'endFlange',
        geometry: doubleLine({ x: 300, y: 480 }, { x: 300, y: 520 }, 4),
        endFlange: newEndFlangeData('flare'),
      }),
    );
    expect(cutStrokesAtBoundary(doc, 'flange')).toHaveLength(1);
    expect((doc.markers.hl!.geometry as StrokeGeometry).points.at(-1)).toEqual([293, 500]);
    expect(strokeAtBoundaries(doc, drawingId, pipe())).toHaveLength(2);
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('edits the tag of an end flange and where it goes', () => {
    const { doc, drawingId } = setup();
    addMarker(
      doc,
      makeCircleMarker(drawingId, {
        id: 'flange',
        shape: 'endFlange',
        geometry: doubleLine({ x: 300, y: 480 }, { x: 300, y: 520 }, 4),
        endFlange: newEndFlangeData(),
      }),
    );
    updateEndFlange(doc, 'flange', { tag: 'FL-7', destination: 'other' });
    expect(doc.markers.flange!.endFlange).toEqual({ tag: 'FL-7', destination: 'other' });
    // Other markers have no end flange data to edit.
    updateEndFlange(doc, 'hl', { tag: 'x' });
    expect(doc.markers.hl).toBeUndefined();
  });

  it('cuts a new stroke at the ESDVs on its drawing', () => {
    const { doc, drawingId } = setup();
    expect(strokeAtBoundaries(doc, drawingId, pipe())).toEqual([pipe()]);
    addMarker(doc, esdv(drawingId));
    expect(strokeAtBoundaries(doc, drawingId, pipe()).map((s) => s.points)).toEqual([
      [
        [0, 500],
        [192, 500],
      ],
      [
        [208, 500],
        [400, 500],
      ],
    ]);
  });
});

describe('equipment follows the highlighting (SEG-06)', () => {
  /** Two pipes, IS-01 along y = 100 and a second segment along y = 300. */
  function highlighted() {
    const { doc, drawingId, segmentId } = setup();
    const other = makeSegment({ id: 'seg_b', label: 'IS-02', colour: 2 });
    doc.segments[other.id] = other;
    doc.segmentOrder.push(other.id);
    const pipe = (id: string, segment: string, y: number): Marker =>
      makeCircleMarker(drawingId, {
        id,
        segmentId: segment,
        shape: 'highlighter',
        geometry: {
          type: 'stroke',
          points: [
            [0, y],
            [1000, y],
          ],
          width: 10,
        },
      });
    addMarker(doc, pipe('pipeA', segmentId, 100));
    addMarker(doc, pipe('pipeB', other.id, 300));
    // The fixture's first marker sits on the first pipe at (100, 100).
    const valve = Object.keys(doc.markers)[0]!;
    const item = Object.values(doc.items).find((i) => i.markerId === valve)!;
    return { doc, drawingId, a: segmentId, b: other.id, valve, item };
  }

  it('moves equipment moved onto the highlighting of another segment to it, with its item', () => {
    const { doc, drawingId, b, valve, item } = highlighted();
    moveMarkers(doc, [valve], 50, 200, true);
    expect(doc.markers[valve]!.segmentId).toBe(b);
    expect(doc.items[item.id]!.segmentId).toBe(b);
    expect(doc.segments[b]!.drawingIds).toContain(drawingId);
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });

  it('keeps the segment when equipment moves off the highlighting, or the setting is off', () => {
    const { doc, a, valve } = highlighted();
    moveMarkers(doc, [valve], 0, 200);
    expect(doc.markers[valve]!.segmentId).toBe(a);
    moveMarkers(doc, [valve], 0, -100, true);
    expect(doc.markers[valve]!.segmentId).toBe(a);
  });

  it('keeps a segment chosen by hand while the equipment stays on the same highlighting', () => {
    const { doc, b, valve } = highlighted();
    assignMarkers(doc, [valve], b);
    // Along the first pipe, then with it.
    moveMarkers(doc, [valve], 20, 2, true);
    moveMarkers(doc, [valve, 'pipeA'], 0, 50, true);
    expect(doc.markers[valve]!.segmentId).toBe(b);
  });

  it('pastes equipment into the segment whose highlighting it lands on', () => {
    const { doc, drawingId, a, b, valve } = highlighted();
    const clip = copyMarkers(doc, [valve])!;
    const [onB] = pasteMarkers(doc, clip, drawingId, { x: 0, y: 200 }, true);
    expect(doc.markers[onB!]!.segmentId).toBe(b);
    expect(Object.values(doc.items).find((i) => i.markerId === onB)?.segmentId).toBe(b);
    // Off the highlighting, or with the setting off, it keeps the copied segment.
    const [off] = pasteMarkers(doc, clip, drawingId, { x: 0, y: 100 }, true);
    const [plain] = pasteMarkers(doc, clip, drawingId, { x: 0, y: 200 });
    expect([off, plain].map((id) => doc.markers[id!]!.segmentId)).toEqual([a, a]);
    expect(checkIntegrity(docToProject(doc))).toEqual([]);
  });
});
