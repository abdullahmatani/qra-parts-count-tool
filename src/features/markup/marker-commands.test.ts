import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemForMarker } from '@/domain/actions/items';
import { starterLibrary } from '@/domain/count/starter-library';
import { projectToDoc } from '@/domain/model';
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
  placeMarker,
  resetClipboard,
  selectAllOnDrawing,
  selectedMarkerIds,
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
          style: { labelOffset: null },
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
