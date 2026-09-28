/**
 * Marker edits. These functions mutate a project document (usually an Immer
 * draft inside `useProjectStore.apply`) and keep related entities consistent.
 */
import { isDraft, original } from 'immer';
import { newId } from '@/lib/ids';
import { cutStroke, isEsdvGeometry, type EsdvGeometry } from '../markup/esdv-boundary';
import { radiusForSymbol, translateGeometry, type XY } from '../markup/geometry';
import {
  highlightOf,
  highlightsOn,
  isEquipmentMarker,
  segmentUnder,
  type Highlight,
} from '../markup/highlighted-segment';
import { penWidth, type HighlighterPen } from '../markup/highlighter';
import type { ProjectDoc } from '../model';
import type {
  CountItem,
  Marker,
  MarkerGeometry,
  MarkerStyle,
  MarkerSymbol,
  StrokeGeometry,
} from '../schema/types';

/** A fresh marker style: a ring (or the given symbol) with the label in its usual place. */
export function newMarkerStyle(
  symbol: MarkerSymbol = 'circle',
  outline: MarkerStyle['outline'] = null,
): MarkerStyle {
  return { labelOffset: null, symbol, outline: symbol === 'freeform' ? outline : null };
}

/** SEG-04: a segment with a marker on a drawing is linked to that drawing. */
export function linkSegmentToDrawing(doc: ProjectDoc, segmentId: string, drawingId: string): void {
  const segment = doc.segments[segmentId];
  if (segment && !segment.drawingIds.includes(drawingId)) segment.drawingIds.push(drawingId);
}

/** Adds a marker (ANN-01) and links its segment to the drawing. */
export function addMarker(doc: ProjectDoc, marker: Marker): void {
  doc.markers[marker.id] = marker;
  if (marker.segmentId) linkSegmentToDrawing(doc, marker.segmentId, marker.drawingId);
}

/**
 * The document as it was before the current edit when `doc` is an Immer
 * draft. Scanning every marker of a draft gives each one a proxy, which is
 * slow on a large project; the base reads at plain-object speed.
 */
function baseOf(doc: ProjectDoc): ProjectDoc {
  return isDraft(doc) ? (original(doc) as ProjectDoc) : doc;
}

/**
 * Reads where equipment sits on the highlighting: each call of the returned
 * function gives the segment whose highlighting each equipment marker among
 * `ids` sits on (null when none; other markers are left out), as the markers
 * are at the time. The highlighting is looked up once, in the base document;
 * highlights among `ids` are read as they are at the time, having moved with
 * the equipment.
 */
function highlightReader(
  doc: ProjectDoc,
  ids: readonly string[],
): () => Map<string, string | null> {
  const base = baseOf(doc);
  const own = new Set(ids);
  const drawings = new Set<string>();
  for (const id of ids) {
    const marker = doc.markers[id];
    if (marker && isEquipmentMarker(marker)) drawings.add(marker.drawingId);
  }
  const highlightIds: string[] = [];
  if (drawings.size > 0) {
    for (const marker of Object.values(base.markers)) {
      if (drawings.has(marker.drawingId) && highlightOf(base, marker)) highlightIds.push(marker.id);
    }
  }
  return () => {
    const highlights = new Map<string, Highlight[]>();
    for (const id of highlightIds) {
      const marker = own.has(id) ? doc.markers[id] : base.markers[id];
      const highlight = marker && highlightOf(base, marker);
      if (!marker || !highlight) continue;
      const list = highlights.get(marker.drawingId) ?? [];
      list.push(highlight);
      highlights.set(marker.drawingId, list);
    }
    const out = new Map<string, string | null>();
    for (const id of ids) {
      const marker = doc.markers[id];
      if (!marker || !isEquipmentMarker(marker) || marker.geometry.type !== 'circle') continue;
      out.set(id, segmentUnder(highlights.get(marker.drawingId) ?? [], marker.geometry));
    }
    return out;
  };
}

/**
 * Moves markers by a distance in drawing units (ANN-04). With
 * `followHighlights`, equipment moved onto another segment's highlighting
 * goes to that segment, with its item; equipment moved off the highlighting,
 * or along with the highlighting it sits on, keeps its segment.
 */
export function moveMarkers(
  doc: ProjectDoc,
  markerIds: Iterable<string>,
  dx: number,
  dy: number,
  followHighlights = false,
): void {
  if (dx === 0 && dy === 0) return;
  const ids = [...markerIds];
  const under = followHighlights ? highlightReader(doc, ids) : null;
  const before = under?.();
  for (const id of ids) {
    const marker = doc.markers[id];
    if (marker) marker.geometry = translateGeometry(marker.geometry, dx, dy);
  }
  if (!under || !before) return;
  const moves = new Map<string, string[]>();
  for (const [id, segmentId] of under()) {
    if (!segmentId || segmentId === before.get(id) || doc.markers[id]?.segmentId === segmentId) {
      continue;
    }
    const list = moves.get(segmentId) ?? [];
    list.push(id);
    moves.set(segmentId, list);
  }
  for (const [segmentId, moved] of moves) assignMarkers(doc, moved, segmentId);
}

/** Replaces a marker's geometry (resize, ANN-04). The shape cannot change. */
export function setMarkerGeometry(
  doc: ProjectDoc,
  markerId: string,
  geometry: MarkerGeometry,
): void {
  const marker = doc.markers[markerId];
  if (!marker) return;
  if (marker.geometry.type !== geometry.type) return;
  marker.geometry = geometry;
}

/** Repaints highlighter strokes with another pen; other markers are left alone. */
export function setHighlighterPen(
  doc: ProjectDoc,
  markerIds: Iterable<string>,
  pen: HighlighterPen,
): void {
  for (const id of markerIds) {
    const marker = doc.markers[id];
    const drawing = marker ? doc.drawings[marker.drawingId] : undefined;
    if (!marker || !drawing || marker.geometry.type !== 'stroke') continue;
    const width = penWidth(pen, drawing.size);
    if (marker.geometry.width !== width) marker.geometry.width = width;
  }
}

/** The shapes of the ESDVs on a drawing. */
function esdvsOn(doc: ProjectDoc, drawingId: string): EsdvGeometry[] {
  const out: EsdvGeometry[] = [];
  for (const marker of Object.values(doc.markers)) {
    if (marker.drawingId === drawingId && marker.esdv && isEsdvGeometry(marker.geometry)) {
      out.push(marker.geometry);
    }
  }
  return out;
}

/**
 * A new highlighter stroke cut at the ESDVs on its drawing (SEG-01): the
 * pieces either side of each ESDV it runs through, or just the stroke.
 */
export function strokeAtEsdvs(
  doc: ProjectDoc,
  drawingId: string,
  stroke: StrokeGeometry,
): StrokeGeometry[] {
  return cutStroke(stroke, esdvsOn(doc, drawingId)) ?? [stroke];
}

/**
 * An ESDV is a segment boundary (SEG-01): highlighter strokes on its drawing
 * that run through it are cut there, so the paint stops at it and each side
 * can go to its own segment. The first piece keeps the stroke (its id,
 * segment and note references); the others are new strokes in the same
 * segment. Returns the ids of the new strokes.
 */
export function cutStrokesAtEsdv(doc: ProjectDoc, esdvId: string): string[] {
  const esdv = doc.markers[esdvId];
  if (!esdv?.esdv || !isEsdvGeometry(esdv.geometry)) return [];
  const boundary = esdv.geometry;
  const added: string[] = [];
  for (const marker of Object.values(doc.markers)) {
    if (marker.drawingId !== esdv.drawingId || marker.geometry.type !== 'stroke') continue;
    const pieces = cutStroke(marker.geometry, [boundary]);
    if (!pieces) continue;
    const [first, ...rest] = pieces;
    marker.geometry = first!;
    for (const geometry of rest) {
      const id = newId('mkr');
      addMarker(doc, {
        id,
        drawingId: marker.drawingId,
        segmentId: marker.segmentId,
        shape: marker.shape,
        geometry,
        style: newMarkerStyle(),
        esdv: null,
      });
      added.push(id);
    }
  }
  return added;
}

/**
 * Changes how equipment circles are drawn (ring, dot or square). A dot is
 * smaller than a ring around the same symbol, so the radius follows the symbol.
 * A free-form outline is only ever drawn, so it cannot be chosen here, and
 * ESDVs and dashed highlights keep their own look.
 */
export function setMarkerSymbol(
  doc: ProjectDoc,
  markerIds: Iterable<string>,
  symbol: Exclude<MarkerSymbol, 'freeform'>,
): void {
  for (const id of markerIds) {
    const marker = doc.markers[id];
    if (!marker || marker.esdv || marker.geometry.type !== 'circle') continue;
    const from = marker.style.symbol;
    if (from === symbol) continue;
    marker.geometry.r = radiusForSymbol(marker.geometry.r, from, symbol);
    marker.style.symbol = symbol;
    marker.style.outline = null;
  }
}

/**
 * Moves markers, and their count items, to a segment (ANN-03), or makes them
 * unassigned with `null`. ESDVs keep their own up/downstream segments.
 */
export function assignMarkers(
  doc: ProjectDoc,
  markerIds: Iterable<string>,
  segmentId: string | null,
): void {
  if (segmentId !== null && !doc.segments[segmentId]) return;
  const ids = new Set<string>();
  for (const id of markerIds) {
    const marker = doc.markers[id];
    if (!marker || marker.esdv) continue;
    ids.add(id);
    if (marker.segmentId !== segmentId) marker.segmentId = segmentId;
    if (segmentId) linkSegmentToDrawing(doc, segmentId, marker.drawingId);
  }
  for (const item of Object.values(doc.items)) {
    if (ids.has(item.markerId) && item.segmentId !== segmentId) item.segmentId = segmentId;
  }
}

/**
 * Deletes markers and everything that depends on them: their count items,
 * references from segments (bounding ESDVs) and note references (NTE-04).
 */
export function deleteMarkers(doc: ProjectDoc, markerIds: Iterable<string>): void {
  const ids = new Set(markerIds);
  if (ids.size === 0) return;
  for (const id of ids) delete doc.markers[id];
  for (const item of Object.values(doc.items)) {
    if (ids.has(item.markerId)) delete doc.items[item.id];
  }
  for (const segment of Object.values(doc.segments)) {
    if (segment.boundingEsdvIds.some((id) => ids.has(id))) {
      segment.boundingEsdvIds = segment.boundingEsdvIds.filter((id) => !ids.has(id));
    }
  }
  for (const note of Object.values(doc.notes)) {
    if (note.markerRef && ids.has(note.markerRef)) note.markerRef = null;
  }
}

/**
 * Takes the next item number. Numbers are never reused, even after an item is
 * deleted, so an item keeps its number for life.
 */
export function takeItemSeq(doc: Pick<ProjectDoc, 'items' | 'nextItemSeq'>): number {
  let seq = doc.nextItemSeq;
  for (const item of Object.values(doc.items)) seq = Math.max(seq, item.seq + 1);
  doc.nextItemSeq = seq + 1;
  return seq;
}

/** Markers copied to the clipboard, with their count items (ANN-04). */
export interface MarkerClip {
  sourceDrawingId: string;
  markers: Marker[];
  items: CountItem[];
}

/** Copies markers and their items as plain data. */
export function copyMarkers(doc: ProjectDoc, markerIds: Iterable<string>): MarkerClip | null {
  const ids = new Set(markerIds);
  const markers = [...ids].map((id) => doc.markers[id]).filter((m): m is Marker => !!m);
  const first = markers[0];
  if (!first) return null;
  const items = Object.values(doc.items).filter((item) => ids.has(item.markerId));
  return structuredClone({ sourceDrawingId: first.drawingId, markers, items });
}

/**
 * Pastes copied markers onto a drawing, moved by `offset`. Pasted markers and
 * items get new ids and item numbers; segments that no longer exist are
 * dropped (the markers become unassigned). With `followHighlights`, equipment
 * pasted onto a segment's highlighting (on the drawing, or pasted with it)
 * goes to that segment. Returns the new marker ids.
 */
export function pasteMarkers(
  doc: ProjectDoc,
  clip: MarkerClip,
  drawingId: string,
  offset: XY,
  followHighlights = false,
): string[] {
  const idMap = new Map<string, string>();
  const segmentOrNull = (id: string | null) => (id && doc.segments[id] ? id : null);
  const markers = clip.markers.map((source): Marker => {
    const id = newId('mkr');
    idMap.set(source.id, id);
    return {
      ...structuredClone(source),
      id,
      drawingId,
      segmentId: segmentOrNull(source.segmentId),
      geometry: translateGeometry(source.geometry, offset.x, offset.y),
      esdv: source.esdv
        ? {
            ...source.esdv,
            upstreamSegmentId: segmentOrNull(source.esdv.upstreamSegmentId),
            downstreamSegmentId: segmentOrNull(source.esdv.downstreamSegmentId),
          }
        : null,
    };
  });
  if (followHighlights) {
    const highlights = [
      ...highlightsOn(baseOf(doc), drawingId),
      ...markers.map((m) => highlightOf(doc, m)).filter((h): h is Highlight => h !== null),
    ];
    for (const marker of markers) {
      if (!isEquipmentMarker(marker) || marker.geometry.type !== 'circle') continue;
      marker.segmentId = segmentUnder(highlights, marker.geometry) ?? marker.segmentId;
    }
  }
  for (const marker of markers) addMarker(doc, marker);
  for (const source of clip.items) {
    const markerId = idMap.get(source.markerId);
    if (!markerId) continue;
    const item: CountItem = {
      ...structuredClone(source),
      id: newId('itm'),
      seq: takeItemSeq(doc),
      markerId,
      drawingId,
      // An item is in its marker's segment.
      segmentId: doc.markers[markerId]!.segmentId,
    };
    doc.items[item.id] = item;
  }
  if (clip.markers.some((m) => m.esdv)) syncBoundingEsdvs(doc);
  return [...idMap.values()];
}

/**
 * SEG-03: a segment's bounding ESDVs are the ESDV markers that name it as their
 * upstream or downstream segment. The ESDV is the source of truth; this keeps
 * each segment's `boundingEsdvIds` in step, in marker order.
 */
export function syncBoundingEsdvs(doc: ProjectDoc): void {
  const bounding = new Map<string, string[]>();
  for (const marker of Object.values(doc.markers)) {
    if (!marker.esdv) continue;
    for (const side of new Set([marker.esdv.upstreamSegmentId, marker.esdv.downstreamSegmentId])) {
      if (!side || !doc.segments[side]) continue;
      const list = bounding.get(side) ?? [];
      list.push(marker.id);
      bounding.set(side, list);
    }
  }
  for (const segment of Object.values(doc.segments)) {
    const next = bounding.get(segment.id) ?? [];
    const same =
      next.length === segment.boundingEsdvIds.length &&
      next.every((id, i) => segment.boundingEsdvIds[i] === id);
    if (!same) segment.boundingEsdvIds = next;
  }
}
