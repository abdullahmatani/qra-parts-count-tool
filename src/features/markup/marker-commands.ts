/**
 * Marker commands used by the canvas tools, shortcuts and panels. Each command
 * is one undo step (PRJ-09) with a label shown in the Undo/Redo tooltips.
 */
import { toast } from 'sonner';
import {
  addMarker,
  assignMarkers,
  copyMarkers,
  cutStrokesAtBoundary,
  deleteMarkers,
  moveMarkers,
  newMarkerStyle,
  pasteMarkers,
  setHighlighterPen,
  setMarkerGeometry,
  setMarkerSymbol,
  strokeAtBoundaries,
  updateEndFlange,
  type EndFlangePatch,
  type MarkerClip,
} from '@/domain/actions/markers';
import type { HighlighterPen } from '@/domain/markup/highlighter';
import type { Draft } from 'immer';
import { addItem, nextTag, type ItemDefaults } from '@/domain/actions/items';
import { updateEsdv, type EsdvPatch } from '@/domain/actions/segments';
import { newEndFlangeData } from '@/domain/end-flange';
import { newEsdvData } from '@/domain/esdv';
import { geometryBounds, unionBoxes, type XY } from '@/domain/markup/geometry';
import { highlightsOn, segmentUnder } from '@/domain/markup/highlighted-segment';
import { isMarkerVisible, itemsByMarker } from '@/domain/markup/presentation';
import type { ProjectDoc } from '@/domain/model';
import type {
  CircleGeometry,
  DoubleLineGeometry,
  EndFlangeDestination,
  Marker,
  MarkerGeometry,
  MarkerStyle,
  MarkerSymbol,
  StrokeGeometry,
} from '@/domain/schema/types';
import i18n from '@/i18n';
import { newId } from '@/lib/ids';
import { usePreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const t = i18n.t.bind(i18n);

function apply(
  label: string,
  recipe: (draft: Draft<ProjectDoc>) => void,
  options?: { coalesceKey?: string },
): boolean {
  return useProjectStore.getState().apply(label, recipe, options);
}

/** The active segment, when it still exists. */
function activeSegmentIn(doc: ProjectDoc): string | null {
  const activeSegmentId = useUiStore.getState().activeSegmentId;
  return activeSegmentId && doc.segments[activeSegmentId] ? activeSegmentId : null;
}

/** Whether equipment goes to the segment whose highlighting it is placed or moved onto (Settings). */
function followHighlights(): boolean {
  return usePreferences.getState().autoAssignSegment;
}

/**
 * The segment new equipment goes to: the segment whose highlighting it is
 * placed on, when that setting is on, or else the active segment.
 */
function placementSegments(
  doc: ProjectDoc,
  drawingId: string,
  geometries: readonly CircleGeometry[],
): (string | null)[] {
  const active = activeSegmentIn(doc);
  const highlights = followHighlights() ? highlightsOn(doc, drawingId) : [];
  return geometries.map((g) => segmentUnder(highlights, g) ?? active);
}

/** Selected markers that still exist on the active drawing. */
export function selectedMarkerIds(): string[] {
  const doc = useProjectStore.getState().doc;
  const { selection, activeDrawingId } = useUiStore.getState();
  if (!doc) return [];
  return selection.filter((id) => doc.markers[id]?.drawingId === activeDrawingId);
}

/**
 * SEG-01: places an ESDV (a red ring round the valve, or a red double line
 * across the pipe, with a tag and size) and opens it for editing. Its upstream
 * and downstream segments are chosen in the panel. Highlighter strokes that
 * run through it are cut there, in the same undo step, so each side can go to
 * its own segment.
 */
export function placeEsdv(
  drawingId: string,
  geometry: CircleGeometry | DoubleLineGeometry,
): string | null {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId]) return null;
  const marker: Marker = {
    id: newId('mkr'),
    drawingId,
    segmentId: null,
    shape: geometry.type,
    geometry,
    style: newMarkerStyle(),
    esdv: newEsdvData(doc.settings.units.size),
    endFlange: null,
  };
  let split = false;
  const done = apply(t('markup.history.addEsdv'), (draft) => {
    addMarker(draft, marker);
    split = cutStrokesAtBoundary(draft, marker.id).length > 0;
  });
  if (!done) return null;
  useUiStore.getState().requestEdit(marker.id);
  if (split) toast(t('markup.esdvSplit'), { duration: 4000 });
  return marker.id;
}

/**
 * Places an end flange: a bar across the pipe where a segment ends at a
 * closed drain, the flare or another end point that is not an ESDV. It goes
 * to the active segment and opens for editing. Like an ESDV, it cuts the
 * highlighter strokes that run through it, in the same undo step.
 */
export function placeEndFlange(
  drawingId: string,
  geometry: DoubleLineGeometry,
  destination: EndFlangeDestination,
): string | null {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId]) return null;
  const marker: Marker = {
    id: newId('mkr'),
    drawingId,
    segmentId: activeSegmentIn(doc),
    shape: 'endFlange',
    geometry,
    style: newMarkerStyle(),
    esdv: null,
    endFlange: newEndFlangeData(destination),
  };
  let split = false;
  const done = apply(t('markup.history.addEndFlange'), (draft) => {
    addMarker(draft, marker);
    split = cutStrokesAtBoundary(draft, marker.id).length > 0;
  });
  if (!done) return null;
  useUiStore.getState().requestEdit(marker.id);
  if (split) toast(t('markup.endFlangeSplit'), { duration: 4000 });
  return marker.id;
}

/** Edits an end flange's tag or destination; typing merges into one undo step. */
export function updateEndFlangeCommand(markerId: string, patch: EndFlangePatch): boolean {
  const fields = Object.keys(patch).sort().join(',');
  return apply(
    t('markup.history.editEndFlange'),
    (draft) => updateEndFlange(draft, markerId, patch),
    { coalesceKey: `endFlange:${markerId}:${fields}` },
  );
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

/**
 * ANN-09: what a stamp click repeats: the type, actuation, size and unit of the
 * item placed or edited last, or null when there is none yet.
 */
export function stampTemplate(doc: ProjectDoc): ItemDefaults | null {
  const lastId = useUiStore.getState().lastItemId;
  const last = lastId ? doc.items[lastId] : undefined;
  if (!last?.equipmentTypeId) return null;
  return {
    equipmentTypeId: last.equipmentTypeId,
    actuation: last.actuation,
    nominalSize: last.nominalSize,
    sizeUnit: last.sizeUnit,
  };
}

/**
 * Paints a highlighter stroke in the active segment (SEG-06). A stroke that
 * runs through an ESDV is cut there (SEG-01), so it may land as several
 * strokes; returns their ids. Highlighting is painting: nothing is selected,
 * so the next stroke starts from a clean slate (Ctrl+Z takes back a stroke
 * that went wrong).
 */
export function placeStroke(drawingId: string, geometry: StrokeGeometry): string[] {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId]) return [];
  const segmentId = activeSegmentIn(doc);
  const markers = strokeAtBoundaries(doc, drawingId, geometry).map((piece): Marker => ({
    id: newId('mkr'),
    drawingId,
    segmentId,
    shape: 'highlighter',
    geometry: piece,
    style: newMarkerStyle(),
    esdv: null,
    endFlange: null,
  }));
  const done = apply(t('markup.history.addHighlighter'), (draft) => {
    for (const marker of markers) addMarker(draft, marker);
  });
  if (!done) return [];
  useUiStore.getState().setSelection([]);
  return markers.map((m) => m.id);
}

/**
 * Paints the strokes of an auto trace in a segment (or unassigned with
 * null), cut at the ESDVs and end flanges they run into, as one undo step.
 * Returns the ids of the new strokes.
 */
export function placeTracedStrokes(
  drawingId: string,
  strokes: readonly StrokeGeometry[],
  segmentId: string | null,
  label: string,
): string[] {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId] || strokes.length === 0) return [];
  const segment = segmentId && doc.segments[segmentId] ? segmentId : null;
  const markers = strokes.flatMap((stroke) =>
    strokeAtBoundaries(doc, drawingId, stroke).map((piece): Marker => ({
      id: newId('mkr'),
      drawingId,
      segmentId: segment,
      shape: 'highlighter',
      geometry: piece,
      style: newMarkerStyle(),
      esdv: null,
      endFlange: null,
    })),
  );
  const done = apply(label, (draft) => {
    for (const marker of markers) addMarker(draft, marker);
  });
  if (!done) return [];
  useUiStore.getState().setSelection([]);
  return markers.map((m) => m.id);
}

/**
 * Places a circle, dashed highlight or highlighter stroke in the active
 * segment (ANN-01, ANN-03, SEG-06). A circle placed on a segment's
 * highlighting goes to that segment instead, when that setting is on. A
 * circle is drawn with `symbol` (a ring unless given); a free-form symbol
 * needs its `outline`. ESDVs are placed with `placeEsdv`.
 */
export function placeMarker(
  drawingId: string,
  geometry: MarkerGeometry,
  options: { stamp?: boolean; symbol?: MarkerSymbol; outline?: MarkerStyle['outline'] } = {},
): string | null {
  if (geometry.type === 'stroke') return placeStroke(drawingId, geometry)[0] ?? null;
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId] || geometry.type === 'doubleLine') return null;
  const segmentId =
    geometry.type === 'circle'
      ? placementSegments(doc, drawingId, [geometry])[0]!
      : activeSegmentIn(doc);
  const marker: Marker = {
    id: newId('mkr'),
    drawingId,
    segmentId,
    shape: geometry.type === 'circle' ? 'circle' : 'dashedHighlight',
    geometry,
    style:
      geometry.type === 'circle'
        ? newMarkerStyle(options.symbol, options.outline ?? null)
        : newMarkerStyle(),
    esdv: null,
    endFlange: null,
  };
  // Circles carry a count item with the last-used type (FDS section 6); line runs
  // carry a pipe item when the project counts pipe lengths (CNT-12).
  const pipeType = doc.library.equipmentTypes.find((type) => type.category === 'pipe');
  const withItem =
    geometry.type === 'circle' ||
    (geometry.type === 'polyline' && doc.settings.pipeLengthCounting && !!pipeType);
  const stamp = options.stamp && geometry.type === 'circle' ? stampTemplate(doc) : null;
  const defaults =
    stamp ??
    (geometry.type === 'circle'
      ? useUiStore.getState().itemDefaults
      : { equipmentTypeId: pipeType?.id ?? null, actuation: null });
  const label =
    geometry.type === 'circle' ? t('markup.history.addCircle') : t('markup.history.addHighlight');
  let itemId: string | null = null;
  const done = apply(label, (draft) => {
    addMarker(draft, marker);
    if (withItem) itemId = addItem(draft, marker.id, defaults);
  });
  if (!done) return null;
  const ui = useUiStore.getState();
  if (itemId) ui.setLastItem(itemId);
  // A typed label counts up for the next marker; a stamp copies no label.
  if (itemId && !stamp && defaults.tag) ui.setItemDefaults({ tag: nextTag(defaults.tag) });
  // A stamped item is complete: select it without taking the keyboard focus.
  if (withItem && !stamp) ui.requestEdit(marker.id);
  else ui.setSelection([marker.id]);
  return marker.id;
}

/** Repaints the highlighter strokes among `ids` with another pen, as one undo step. */
export function setHighlighterPenCommand(ids: readonly string[], pen: HighlighterPen): boolean {
  if (ids.length === 0) return false;
  return apply(t('markup.history.highlighterPen', { count: ids.length }), (draft) =>
    setHighlighterPen(draft, ids, pen),
  );
}

/**
 * Roadmap #60: markers for accepted symbol suggestions, each with a count item
 * from `defaults`, in the active segment (or the segment whose highlighting it
 * is on, as `placeMarker`), as one undo step. Returns their ids.
 */
export function placeSuggestedMarkers(
  drawingId: string,
  geometries: readonly CircleGeometry[],
  defaults: ItemDefaults,
  symbol: Exclude<MarkerSymbol, 'freeform'> = 'circle',
): string[] {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId] || geometries.length === 0) return [];
  const segmentIds = placementSegments(doc, drawingId, geometries);
  const markers: Marker[] = geometries.map((geometry, i) => ({
    id: newId('mkr'),
    drawingId,
    segmentId: segmentIds[i]!,
    shape: 'circle',
    geometry,
    style: newMarkerStyle(symbol),
    esdv: null,
    endFlange: null,
  }));
  const done = apply(t('assist.history', { count: markers.length }), (draft) => {
    for (const marker of markers) {
      addMarker(draft, marker);
      addItem(draft, marker.id, defaults);
    }
  });
  if (!done) return [];
  useUiStore.getState().setSelection(markers.map((m) => m.id));
  return markers.map((m) => m.id);
}

/**
 * Moves markers as one undo step; nudges pass a `coalesceKey` so a run of
 * them is one step. Equipment moved onto another segment's highlighting goes
 * to that segment, when that setting is on.
 */
export function moveMarkerIds(
  ids: readonly string[],
  dx: number,
  dy: number,
  options: { coalesceKey?: string } = {},
): boolean {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return false;
  const follow = followHighlights();
  return apply(
    t('markup.history.move', { count: ids.length }),
    (draft) => moveMarkers(draft, ids, dx, dy, follow),
    options,
  );
}

export function resizeMarker(id: string, geometry: MarkerGeometry): boolean {
  return apply(t('markup.history.resize'), (draft) => setMarkerGeometry(draft, id, geometry));
}

/** Draws the equipment circles among `ids` as rings, dots or squares, as one undo step. */
export function setMarkerSymbolCommand(
  ids: readonly string[],
  symbol: Exclude<MarkerSymbol, 'freeform'>,
): boolean {
  if (ids.length === 0) return false;
  return apply(t('markup.history.symbol', { count: ids.length }), (draft) =>
    setMarkerSymbol(draft, ids, symbol),
  );
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
    pasted = pasteMarkers(draft, clip, activeDrawingId, offset, followHighlights());
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
