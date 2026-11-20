/**
 * Marker commands used by the canvas tools, shortcuts and panels. Each command
 * is one undo step (PRJ-09) with a label shown in the Undo/Redo tooltips.
 */
import { toast } from 'sonner';
import {
  addMarker,
  applyErasure,
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
import type { Erasure } from '@/domain/markup/eraser';
import type { HighlighterPen } from '@/domain/markup/highlighter';
import type { Draft } from 'immer';
import { addItem, itemForMarker, nextTag, type ItemDefaults } from '@/domain/actions/items';
import { updateEsdv, type EsdvPatch } from '@/domain/actions/segments';
import { newEndFlangeData } from '@/domain/end-flange';
import { newEsdvData } from '@/domain/esdv';
import {
  DOT_SCALE,
  geometryBounds,
  pickMarker,
  unionBoxes,
  type XY,
} from '@/domain/markup/geometry';
import { highlightsOn, segmentUnder } from '@/domain/markup/highlighted-segment';
import { isMarkerVisible, itemsByMarker } from '@/domain/markup/presentation';
import type { ProjectDoc } from '@/domain/model';
import type {
  Actuation,
  CircleGeometry,
  DoubleLineGeometry,
  EndFlangeDestination,
  Marker,
  MarkerGeometry,
  MarkerStyle,
  MarkerSymbol,
  StrokeGeometry,
} from '@/domain/schema/types';
import { isEditableInStage } from '@/domain/stage';
import { updateItemCommand } from '@/features/count/item-commands';
import { currentStage } from '@/features/stage/stage';
import { BASE_SCALE } from '@/features/viewer/view-transform';
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
  options: {
    stamp?: boolean;
    symbol?: MarkerSymbol;
    outline?: MarkerStyle['outline'];
    /** Open the new item in the editor with the keyboard focus (default); false only selects it. */
    focus?: boolean;
  } = {},
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
  if (withItem && !stamp && options.focus !== false) ui.requestEdit(marker.id);
  else ui.setSelection([marker.id]);
  return marker.id;
}

/** What a marker counts, picked on the quick-pick wheel or with a type's key. */
export interface EquipmentPick {
  typeId: string;
  /** The valve actuation, for types that carry one. */
  actuation: Actuation | null;
}

/**
 * Places an equipment marker centred on `centre`, counted as `pick`, with the
 * shape and size of the equipment bar (a ring for the free-form shape, which
 * is dragged round a symbol). The pick becomes what the next markers count,
 * as if chosen in the bar. With `focus` the item editor takes the keyboard for
 * its size; without, the marker is only selected, so the next key can place
 * the next one.
 */
export function placeEquipment(
  drawingId: string,
  centre: XY,
  pick: EquipmentPick,
  { focus }: { focus: boolean },
): string | null {
  const ui = useUiStore.getState();
  ui.setItemDefaults({
    equipmentTypeId: pick.typeId,
    ...(pick.actuation ? { actuation: pick.actuation } : {}),
  });
  const drawing = useProjectStore.getState().doc?.drawings[drawingId];
  if (!drawing) return null;
  const symbol: MarkerSymbol = ui.markerSymbol === 'freeform' ? 'circle' : ui.markerSymbol;
  const longSide = Math.max(drawing.size.width, drawing.size.height);
  const r = ui.circleRadiusFraction * longSide * (symbol === 'dot' ? DOT_SCALE : 1);
  return placeMarker(
    drawingId,
    { type: 'circle', cx: centre.x, cy: centre.y, r },
    { symbol, focus },
  );
}

/** How near (CSS px) the pointer must be to a marker for a type key to change it. */
const KEY_HIT_TOLERANCE = 6;

/**
 * Point and press (ANN-08, CNT-01): a type's key pressed with the pointer on
 * the drawing counts what is under it. Over an equipment marker, its item
 * takes the type and the editor opens at its size; elsewhere a new marker is
 * placed there, counted as the type, without taking the keyboard, so the next
 * symbol is counted by pointing at it and pressing its key. Returns false
 * when the pointer is not on the active drawing.
 */
export function countAtPointer(pick: EquipmentPick): boolean {
  const ui = useUiStore.getState();
  const doc = useProjectStore.getState().doc;
  const { activeDrawingId: drawingId, cursor } = ui;
  if (!doc || !drawingId || !cursor || !doc.drawings[drawingId]) return false;
  const zoom = ui.viewports[drawingId]?.zoom;
  if (!zoom) return false;
  const items = itemsByMarker(doc.items);
  const stage = currentStage();
  const equipment = Object.values(doc.markers).filter(
    (m) =>
      m.drawingId === drawingId &&
      m.geometry.type === 'circle' &&
      isMarkerVisible(m, items.get(m.id), ui.filters) &&
      isEditableInStage(m, stage, doc.settings.pipeLengthCounting),
  );
  const hit = pickMarker(equipment, cursor, KEY_HIT_TOLERANCE / (zoom * BASE_SCALE));
  if (hit) {
    const item = itemForMarker(doc, hit.id);
    if (!item) return false;
    updateItemCommand(item.id, {
      equipmentTypeId: pick.typeId,
      ...(pick.actuation ? { actuation: pick.actuation } : {}),
    });
    ui.requestEdit(hit.id, 'size');
    return true;
  }
  return placeEquipment(drawingId, cursor, pick, { focus: false }) !== null;
}

/**
 * Rubs out highlighter paint (SEG-06): leaves the strokes the eraser went
 * over as it left them, as one undo step. Strokes rubbed out altogether are
 * deleted, and drop out of the selection.
 */
export function eraseStrokes(erasure: Erasure): boolean {
  if (erasure.left.size === 0) return false;
  let deleted: string[] = [];
  const done = apply(t('markup.history.erase'), (draft) => {
    deleted = applyErasure(draft, erasure).deleted;
  });
  if (done && deleted.length) {
    const ui = useUiStore.getState();
    ui.setSelection(ui.selection.filter((id) => !deleted.includes(id)));
  }
  return done;
}

/** Repaints the highlighter strokes among `ids` with another pen, as one undo step. */
export function setHighlighterPenCommand(ids: readonly string[], pen: HighlighterPen): boolean {
  if (ids.length === 0) return false;
  return apply(t('markup.history.highlighterPen', { count: ids.length }), (draft) =>
    setHighlighterPen(draft, ids, pen),
  );
}

/** An accepted symbol suggestion: where its marker goes, how it is drawn and what it counts. */
export interface SuggestedPlacement {
  geometry: CircleGeometry;
  symbol: Exclude<MarkerSymbol, 'freeform'>;
  defaults: ItemDefaults;
}

/**
 * Roadmap #60: markers for accepted symbol suggestions, each with a count item
 * from its `defaults`, in the active segment (or the segment whose
 * highlighting it is on, as `placeMarker`), as one undo step. Returns their ids.
 */
export function placeSuggestedMarkers(
  drawingId: string,
  placements: readonly SuggestedPlacement[],
): string[] {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId] || placements.length === 0) return [];
  const segmentIds = placementSegments(
    doc,
    drawingId,
    placements.map((p) => p.geometry),
  );
  const markers: Marker[] = placements.map(({ geometry, symbol }, i) => ({
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
    markers.forEach((marker, i) => {
      addMarker(draft, marker);
      addItem(draft, marker.id, placements[i]!.defaults);
    });
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

/**
 * Copies the selected markers and deletes them, as one undo step for the
 * delete. Returns how many were cut.
 */
export function cutSelection(): number {
  const ids = selectedMarkerIds();
  const count = copySelection();
  if (count === 0) return 0;
  return deleteMarkerIds(ids) ? count : 0;
}

/**
 * Pastes the clipboard on the active drawing: centred on `at` (drawing
 * coordinates) when given, as from the canvas's context menu, else as
 * `pasteOffset` places it from the pointer.
 */
export function pasteClipboard(at?: XY | null): number {
  const { activeDrawingId } = useUiStore.getState();
  const cursor = at ?? useUiStore.getState().cursor;
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
  // While counting, the segments' set-up is locked and cannot be selected.
  const stage = currentStage();
  const ids = Object.values(doc.markers)
    .filter(
      (m) =>
        m.drawingId === drawingId &&
        isMarkerVisible(m, items.get(m.id), filters) &&
        isEditableInStage(m, stage, doc.settings.pipeLengthCounting),
    )
    .map((m) => m.id);
  useUiStore.getState().setSelection(ids);
  return ids.length;
}

/** Test hook: forget the clipboard. */
export function resetClipboard(): void {
  clipboard = null;
  pasteCount = 0;
}
