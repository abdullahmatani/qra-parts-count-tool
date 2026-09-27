import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemForMarker } from '@/domain/actions/items';
import { starterLibrary } from '@/domain/count/starter-library';
import { projectToDoc } from '@/domain/model';
import { doubleLine } from '@/domain/markup/esdv-boundary';
import { penWidth } from '@/domain/markup/highlighter';
import { updateItemCommand } from '@/features/count/item-commands';
import { makePopulatedProject } from '@/test/fixtures';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import {
  assignMarkerIds,
  copySelection,
  deleteMarkerIds,
  pasteClipboard,
  pasteOffset,
  placeEsdv,
  placeMarker,
  placeStroke,
  resetClipboard,
  selectAllOnDrawing,
  selectedMarkerIds,
  setHighlighterPenCommand,
  setMarkerSymbolCommand,
} from './marker-commands';

const project = () => useProjectStore.getState();
const ui = () => useUiStore.getState();
const markerCount = () => Object.keys(project().doc!.markers).length;

describe('marker commands', () => {
  let drawingId: string;
  let segmentId: string;

  beforeEach(() => {
    project().load(projectToDoc(makePopulatedProject()));
    drawingId = project().doc!.drawingOrder[0]!;
    segmentId = project().doc!.segmentOrder[0]!;
    ui().reset();
    ui().openDrawing(drawingId);
    resetClipboard();
  });
  afterEach(() => {
    project().close();
    ui().reset();
  });

  it('places a marker in the active segment and selects it (ANN-03, SEG-06)', () => {
    ui().setActiveSegment(segmentId);
    const id = placeMarker(drawingId, { type: 'circle', cx: 5, cy: 5, r: 3 })!;
    expect(project().doc!.markers[id]).toMatchObject({ segmentId, shape: 'circle' });
    expect(ui().selection).toEqual([id]);
    expect(project().past.at(-1)?.label).toBe('add circle');
  });

  it('places equipment markers with the chosen shape, and changes it as one undo step', () => {
    const outline: [number, number][] = [
      [0, -1],
      [1, 0],
      [0, 1],
    ];
    const square = placeMarker(
      drawingId,
      { type: 'circle', cx: 5, cy: 5, r: 3 },
      {
        symbol: 'square',
      },
    )!;
    const traced = placeMarker(
      drawingId,
      { type: 'circle', cx: 50, cy: 5, r: 3 },
      {
        symbol: 'freeform',
        outline,
      },
    )!;
    expect(project().doc!.markers[square]!.style).toMatchObject({
      symbol: 'square',
      outline: null,
    });
    expect(project().doc!.markers[traced]!.style).toMatchObject({ symbol: 'freeform', outline });
    // Both still carry a count item: the shape never changes what is counted.
    expect(itemForMarker(project().doc!, square)).toBeDefined();
    expect(itemForMarker(project().doc!, traced)).toBeDefined();

    expect(setMarkerSymbolCommand([square, traced], 'circle')).toBe(true);
    expect(project().past.at(-1)?.label).toBe('change the shape of 2 markers');
    expect(project().doc!.markers[traced]!.style).toMatchObject({
      symbol: 'circle',
      outline: null,
    });
    project().undo();
    expect(project().doc!.markers[traced]!.style.symbol).toBe('freeform');
  });

  it('paints highlighter strokes in the active segment, without an item or a selection', () => {
    ui().setActiveSegment(segmentId);
    const marker = Object.keys(project().doc!.markers)[0]!;
    ui().setSelection([marker]);
    const stroke = {
      type: 'stroke' as const,
      points: [
        [0, 0],
        [80, 20],
      ] as [number, number][],
      width: 16,
    };
    const id = placeMarker(drawingId, stroke)!;
    expect(project().doc!.markers[id]).toMatchObject({
      shape: 'highlighter',
      segmentId,
      geometry: stroke,
    });
    expect(itemForMarker(project().doc!, id)).toBeUndefined();
    expect(project().past.at(-1)?.label).toBe('add highlighter stroke');
    // Painting leaves nothing selected, so Delete cannot remove the wrong marker.
    expect(ui().selection).toEqual([]);

    // A broader pen for this stroke; the circle among the ids is left alone.
    expect(setHighlighterPenCommand([id, marker], 'broad')).toBe(true);
    const size = project().doc!.drawings[drawingId]!.size;
    expect(project().doc!.markers[id]!.geometry).toMatchObject({
      width: penWidth('broad', size),
    });
    expect(project().doc!.markers[marker]!.geometry.type).toBe('circle');
    expect(project().past.at(-1)?.label).toBe('change the pen of 2 highlighter strokes');
  });

  it('places an ESDV as a double line that cuts the highlighter it crosses, as one undo step', () => {
    ui().setActiveSegment(segmentId);
    const pipe = {
      type: 'stroke' as const,
      points: [
        [0, 600],
        [400, 600],
      ] as [number, number][],
      width: 10,
    };
    const [stroke] = placeStroke(drawingId, pipe);
    const before = markerCount();

    const id = placeEsdv(drawingId, doubleLine({ x: 200, y: 580 }, { x: 200, y: 620 }, 6))!;
    const doc = project().doc!;
    expect(doc.markers[id]).toMatchObject({
      shape: 'doubleLine',
      segmentId: null,
      esdv: { tag: '', upstreamSegmentId: null },
    });
    // The ESDV and the second half of the stroke.
    expect(markerCount()).toBe(before + 2);
    const strokes = Object.values(doc.markers).filter((m) => m.geometry.type === 'stroke');
    expect(strokes.map((m) => m.segmentId)).toEqual([segmentId, segmentId]);
    expect(doc.markers[stroke!]!.geometry).toMatchObject({
      points: [
        [0, 600],
        [192, 600],
      ],
    });
    // It opens in the panel for its tag and segments.
    expect(ui().selection).toEqual([id]);
    expect(project().past.at(-1)?.label).toBe('add ESDV');

    project().undo();
    expect(markerCount()).toBe(before);
    expect(project().doc!.markers[stroke!]!.geometry).toEqual(pipe);
  });

  it('paints a stroke across an ESDV as a piece on each side', () => {
    placeEsdv(drawingId, { type: 'circle', cx: 200, cy: 600, r: 10 });
    const ids = placeStroke(drawingId, {
      type: 'stroke',
      points: [
        [0, 600],
        [400, 600],
      ],
      width: 10,
    });
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => project().doc!.markers[id]!.geometry)).toMatchObject([
      {
        points: [
          [0, 600],
          [185, 600],
        ],
      },
      {
        points: [
          [215, 600],
          [400, 600],
        ],
      },
    ]);
    expect(ui().selection).toEqual([]);
    // One stroke painted, one step to take it back.
    project().undo();
    expect(ids.some((id) => project().doc!.markers[id])).toBe(false);
  });

  it('places unassigned markers when there is no active segment', () => {
    const id = placeMarker(drawingId, { type: 'rect', x: 0, y: 0, width: 5, height: 5 })!;
    expect(project().doc!.markers[id]).toMatchObject({
      segmentId: null,
      shape: 'dashedHighlight',
    });
  });

  it('stamp mode repeats the last item without opening the editor (ANN-09)', () => {
    project().load(projectToDoc({ ...makePopulatedProject(), library: starterLibrary() }));
    drawingId = project().doc!.drawingOrder[0]!;
    ui().openDrawing(drawingId);
    const valve = project().doc!.library.equipmentTypes.find((t) => t.category === 'valve')!;
    // With nothing to repeat yet, a stamp click behaves like the circle tool.
    const first = placeMarker(drawingId, { type: 'circle', cx: 5, cy: 5, r: 3 }, { stamp: true })!;
    expect(ui().editRequest?.markerId).toBe(first);
    const item = itemForMarker(project().doc!, first)!;
    updateItemCommand(item.id, {
      equipmentTypeId: valve.id,
      actuation: 'automated',
      nominalSize: 1.5,
    });

    const before = ui().editRequest;
    const second = placeMarker(drawingId, { type: 'circle', cx: 9, cy: 5, r: 3 }, { stamp: true })!;
    expect(itemForMarker(project().doc!, second)).toMatchObject({
      equipmentTypeId: valve.id,
      actuation: 'automated',
      nominalSize: 1.5,
      sizeUnit: 'in',
    });
    expect(ui().editRequest).toBe(before);
    expect(ui().selection).toEqual([second]);
    // The next stamp repeats the stamped item in turn.
    const third = placeMarker(drawingId, { type: 'circle', cx: 13, cy: 5, r: 3 }, { stamp: true })!;
    expect(itemForMarker(project().doc!, third)?.nominalSize).toBe(1.5);
  });

  it('refuses edits on a read-only project', () => {
    project().setReadOnly(true);
    expect(placeMarker(drawingId, { type: 'circle', cx: 5, cy: 5, r: 3 })).toBeNull();
  });

  it('deletes and reassigns markers as single undo steps', () => {
    const ids = Object.keys(project().doc!.markers);
    assignMarkerIds(ids, null);
    expect(project().past.at(-1)?.label).toBe('move 2 markers to No segment');
    ui().setSelection(ids);
    deleteMarkerIds(ids);
    expect(markerCount()).toBe(0);
    expect(ui().selection).toEqual([]);
    project().undo();
    expect(markerCount()).toBe(2);
  });

  it('copies the selection and pastes it stepped down-right (ANN-04)', () => {
    const ids = Object.keys(project().doc!.markers);
    ui().setSelection([ids[0]!]);
    expect(copySelection()).toBe(1);
    expect(pasteClipboard()).toBe(1);
    expect(pasteClipboard()).toBe(1);
    expect(markerCount()).toBe(4);
    const pasted = ui().selection[0]!;
    const original = project().doc!.markers[ids[0]!]!.geometry;
    const copy = project().doc!.markers[pasted]!.geometry;
    expect(copy.type === 'circle' && original.type === 'circle' && copy.cx > original.cx).toBe(
      true,
    );
  });

  it('pastes centred on the pointer when it is over the drawing', () => {
    const clip = {
      sourceDrawingId: 'a',
      markers: [
        {
          id: 'm',
          drawingId: 'a',
          segmentId: null,
          shape: 'circle' as const,
          geometry: { type: 'circle' as const, cx: 10, cy: 10, r: 2 },
          style: { labelOffset: null, symbol: 'circle' as const, outline: null },
          esdv: null,
        },
      ],
      items: [],
    };
    expect(pasteOffset(clip, 'a', { x: 50, y: 60 }, 5, 1)).toEqual({ x: 40, y: 50 });
    expect(pasteOffset(clip, 'b', null, 5, 1)).toEqual({ x: 0, y: 0 });
    expect(pasteOffset(clip, 'a', null, 5, 2)).toEqual({ x: 10, y: 10 });
  });

  it('selects all visible markers on the active drawing', () => {
    expect(selectAllOnDrawing()).toBe(2);
    ui().setFilters({ hiddenSegments: [segmentId] });
    expect(selectAllOnDrawing()).toBe(0);
  });

  it('ignores selected markers on other drawings', () => {
    ui().setSelection(['nope', ...Object.keys(project().doc!.markers)]);
    expect(selectedMarkerIds()).toHaveLength(2);
  });
});
