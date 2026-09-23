/**
 * Marker edits. These functions mutate a project document (usually an Immer
 * draft inside `useProjectStore.apply`) and keep related entities consistent.
 */
import type { ProjectDoc } from '../model';

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
