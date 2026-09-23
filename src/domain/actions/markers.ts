/**
 * Marker edits. These functions mutate a project document (usually an Immer
 * draft inside `useProjectStore.apply`) and keep related entities consistent.
 */
import { newId } from '@/lib/ids';
import { translateGeometry, type XY } from '../markup/geometry';
import type { ProjectDoc } from '../model';
import type { CountItem, Marker, MarkerGeometry } from '../schema/types';

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

/** Moves markers by a distance in drawing units (ANN-04). */
export function moveMarkers(
  doc: ProjectDoc,
  markerIds: Iterable<string>,
  dx: number,
  dy: number,
): void {
  if (dx === 0 && dy === 0) return;
  for (const id of markerIds) {
    const marker = doc.markers[id];
    if (marker) marker.geometry = translateGeometry(marker.geometry, dx, dy);
  }
}

/** Replaces a marker's geometry (resize, ANN-04). The shape cannot change. */
export function setMarkerGeometry(
  doc: ProjectDoc,
  markerId: string,
  geometry: MarkerGeometry,
): void {
  const marker = doc.markers[markerId];
  if (!marker) return;
  if ((marker.shape === 'circle') !== (geometry.type === 'circle')) return;
  marker.geometry = geometry;
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
 * dropped (the markers become unassigned). Returns the new marker ids.
 */
export function pasteMarkers(
  doc: ProjectDoc,
  clip: MarkerClip,
  drawingId: string,
  offset: XY,
): string[] {
  const idMap = new Map<string, string>();
  const segmentOrNull = (id: string | null) => (id && doc.segments[id] ? id : null);
  for (const source of clip.markers) {
    const id = newId('mkr');
    idMap.set(source.id, id);
    addMarker(doc, {
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
    });
  }
  for (const source of clip.items) {
    const markerId = idMap.get(source.markerId);
    if (!markerId) continue;
    const item: CountItem = {
      ...structuredClone(source),
      id: newId('itm'),
      seq: takeItemSeq(doc),
      markerId,
      drawingId,
      segmentId: segmentOrNull(source.segmentId),
    };
    doc.items[item.id] = item;
  }
  return [...idMap.values()];
}
