/**
 * Marker commands used by the canvas tools, shortcuts and panels. Each command
 * is one undo step (PRJ-09) with a label shown in the Undo/Redo tooltips.
 */
import {
  addMarker,
  assignMarkers,
  copyMarkers,
  deleteMarkers,
  moveMarkers,
  pasteMarkers,
  setMarkerGeometry,
  type MarkerClip,
} from '@/domain/actions/markers';
import type { Draft } from 'immer';
import { addItem } from '@/domain/actions/items';
import { updateEsdv, type EsdvPatch } from '@/domain/actions/segments';
import { newEsdvData } from '@/domain/esdv';
import { geometryBounds, unionBoxes, type XY } from '@/domain/markup/geometry';
import { isMarkerVisible, itemsByMarker } from '@/domain/markup/presentation';
import type { ProjectDoc } from '@/domain/model';
import type { Marker, MarkerGeometry } from '@/domain/schema/types';
import i18n from '@/i18n';
import { newId } from '@/lib/ids';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const t = i18n.t.bind(i18n);

function apply(label: string, recipe: (draft: Draft<ProjectDoc>) => void): boolean {
  return useProjectStore.getState().apply(label, recipe);
}

/** Selected markers that still exist on the active drawing. */
export function selectedMarkerIds(): string[] {
  const doc = useProjectStore.getState().doc;
  const { selection, activeDrawingId } = useUiStore.getState();
  if (!doc) return [];
  return selection.filter((id) => doc.markers[id]?.drawingId === activeDrawingId);
}

/**
 * SEG-01: places an ESDV (a red circle marker with a tag and size) and opens
 * it for editing. Its upstream and downstream segments are chosen in the panel.
 */
export function placeEsdv(drawingId: string, geometry: MarkerGeometry): string | null {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId] || geometry.type !== 'circle') return null;
  const marker: Marker = {
    id: newId('mkr'),
    drawingId,
    segmentId: null,
    shape: 'circle',
    geometry,
    style: { labelOffset: null },
    esdv: newEsdvData(doc.settings.units.size),
  };
  if (!apply(t('markup.history.addEsdv'), (draft) => addMarker(draft, marker))) return null;
  useUiStore.getState().requestEdit(marker.id);
  return marker.id;
}

/** Edits an ESDV's data; typing merges into one undo step per field. */
export function updateEsdvCommand(markerId: string, patch: EsdvPatch): boolean {
  const fields = Object.keys(patch).sort().join(',');
  return useProjectStore
    .getState()
    .apply(t('markup.history.editEsdv'), (draft) => updateEsdv(draft, markerId, patch), {
      coalesceKey: `esdv:${markerId}:${fields}`,
    });
}

/** Places a circle or dashed highlight in the active segment (ANN-01, ANN-03, SEG-06). */
export function placeMarker(drawingId: string, geometry: MarkerGeometry): string | null {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId]) return null;
  const activeSegmentId = useUiStore.getState().activeSegmentId;
  const segmentId = activeSegmentId && doc.segments[activeSegmentId] ? activeSegmentId : null;
  const marker: Marker = {
    id: newId('mkr'),
    drawingId,
    segmentId,
    shape: geometry.type === 'circle' ? 'circle' : 'dashedHighlight',
    geometry,
    style: { labelOffset: null },
    esdv: null,
  };
  // Circles carry a count item with the last-used type (FDS section 6); line runs
  // carry a pipe item when the project counts pipe lengths (CNT-12).
  const pipeType = doc.library.equipmentTypes.find((type) => type.category === 'pipe');
  const withItem =
    geometry.type === 'circle' ||
    (geometry.type === 'polyline' && doc.settings.pipeLengthCounting && !!pipeType);
  const defaults =
    geometry.type === 'circle'
      ? useUiStore.getState().itemDefaults
      : { equipmentTypeId: pipeType?.id ?? null, actuation: null };
  const label =
    geometry.type === 'circle' ? t('markup.history.addCircle') : t('markup.history.addHighlight');
  const done = apply(label, (draft) => {
    addMarker(draft, marker);
    if (withItem) addItem(draft, marker.id, defaults);
  });
  if (!done) return null;
  if (withItem) useUiStore.getState().requestEdit(marker.id);
  else useUiStore.getState().setSelection([marker.id]);
  return marker.id;
}

export function moveMarkerIds(ids: readonly string[], dx: number, dy: number): boolean {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return false;
  return apply(t('markup.history.move', { count: ids.length }), (draft) =>
    moveMarkers(draft, ids, dx, dy),
  );
}

export function resizeMarker(id: string, geometry: MarkerGeometry): boolean {
  return apply(t('markup.history.resize'), (draft) => setMarkerGeometry(draft, id, geometry));
}

export function deleteMarkerIds(ids: readonly string[]): boolean {
  if (ids.length === 0) return false;
  const done = apply(t('markup.history.delete', { count: ids.length }), (draft) =>
    deleteMarkers(draft, ids),
  );
  if (done) {
    const remaining = useUiStore.getState().selection.filter((id) => !ids.includes(id));
    useUiStore.getState().setSelection(remaining);
  }
  return done;
}

export function assignMarkerIds(ids: readonly string[], segmentId: string | null): boolean {
  const doc = useProjectStore.getState().doc;
  if (!doc || ids.length === 0) return false;
  const name = segmentId ? (doc.segments[segmentId]?.label ?? '') : t('markup.noSegment');
  return apply(t('markup.history.assign', { count: ids.length, segment: name }), (draft) =>
    assignMarkers(draft, ids, segmentId),
  );
}

// ---------------------------------------------------------------------------
// Clipboard (ANN-04). Kept in memory: markers are project data, not text.
// ---------------------------------------------------------------------------

let clipboard: MarkerClip | null = null;
/** How many times the current clipboard was pasted onto its own drawing. */
let pasteCount = 0;

export function hasClipboard(): boolean {
  return clipboard !== null;
}

export function copySelection(): number {
  const doc = useProjectStore.getState().doc;
  const ids = selectedMarkerIds();
  if (!doc || ids.length === 0) return 0;
  clipboard = copyMarkers(doc, ids);
  pasteCount = 0;
  return clipboard?.markers.length ?? 0;
}

/**
 * Where pasted markers go: centred on the pointer when it is over the drawing;
 * otherwise in place on another drawing, or stepped down-right on the same one.
 */
export function pasteOffset(
  clip: MarkerClip,
  drawingId: string,
  cursor: XY | null,
  step: number,
  count: number,
): XY {
  const box = unionBoxes(clip.markers.map((m) => geometryBounds(m.geometry)));
  if (cursor && box) {
    return { x: cursor.x - (box.minX + box.maxX) / 2, y: cursor.y - (box.minY + box.maxY) / 2 };
  }
  if (drawingId !== clip.sourceDrawingId) return { x: 0, y: 0 };
  return { x: step * count, y: step * count };
}

export function pasteClipboard(): number {
  const { activeDrawingId, cursor } = useUiStore.getState();
  const doc = useProjectStore.getState().doc;
  const clip = clipboard;
  if (!clip || !activeDrawingId || !doc?.drawings[activeDrawingId]) return 0;
  const drawing = doc.drawings[activeDrawingId];
  const step = Math.max(drawing.size.width, drawing.size.height) / 150;
  if (!cursor && activeDrawingId === clip.sourceDrawingId) pasteCount += 1;
  const offset = pasteOffset(clip, activeDrawingId, cursor, step, pasteCount);
  let pasted: string[] = [];
  const done = apply(t('markup.history.paste', { count: clip.markers.length }), (draft) => {
    pasted = pasteMarkers(draft, clip, activeDrawingId, offset);
  });
  if (!done) return 0;
  useUiStore.getState().setSelection(pasted);
  return pasted.length;
}

/** Selects every visible marker on the active drawing. */
export function selectAllOnDrawing(): number {
  const doc = useProjectStore.getState().doc;
  const { activeDrawingId: drawingId, filters } = useUiStore.getState();
  if (!doc || !drawingId) return 0;
  const items = itemsByMarker(doc.items);
  const ids = Object.values(doc.markers)
    .filter((m) => m.drawingId === drawingId && isMarkerVisible(m, items.get(m.id), filters))
    .map((m) => m.id);
  useUiStore.getState().setSelection(ids);
  return ids.length;
}

/** Test hook: forget the clipboard. */
export function resetClipboard(): void {
  clipboard = null;
  pasteCount = 0;
}
