import type { ProjectDoc } from '../model';
import type { Drawing } from '../schema/types';
import { deleteMarkers } from './markers';

export type DrawingMetadata = Pick<
  Drawing,
  'drawingNo' | 'sheet' | 'title' | 'revision' | 'isCadPlot'
>;

/** Adds imported drawings to the register, keeping their order (DRW-01, DRW-03). */
export function addDrawings(doc: ProjectDoc, drawings: readonly Drawing[]): void {
  for (const drawing of drawings) {
    if (doc.drawings[drawing.id]) continue;
    doc.drawings[drawing.id] = drawing;
    doc.drawingOrder.push(drawing.id);
  }
}

/** Edits a drawing's metadata (DRW-04). */
export function updateDrawing(
  doc: ProjectDoc,
  drawingId: string,
  patch: Partial<DrawingMetadata>,
): void {
  const drawing = doc.drawings[drawingId];
  if (!drawing) return;
  for (const [key, value] of Object.entries(patch) as [keyof DrawingMetadata, never][]) {
    if (drawing[key] !== value) drawing[key] = value;
  }
}

/**
 * Removes a drawing from the project together with its markers, count items
 * and links; links on other drawings that pointed at it become broken targets
 * (LNK-05). The file stays in drawings/, so the removal can be undone.
 */
export function removeDrawing(doc: ProjectDoc, drawingId: string): void {
  if (!doc.drawings[drawingId]) return;
  const markerIds = Object.values(doc.markers)
    .filter((marker) => marker.drawingId === drawingId)
    .map((marker) => marker.id);
  deleteMarkers(doc, markerIds);
  for (const link of Object.values(doc.links)) {
    if (link.sourceDrawingId === drawingId) delete doc.links[link.id];
    else if (link.targetDrawingId === drawingId) link.targetDrawingId = null;
  }
  for (const segment of Object.values(doc.segments)) {
    if (segment.drawingIds.includes(drawingId)) {
      segment.drawingIds = segment.drawingIds.filter((id) => id !== drawingId);
    }
  }
  delete doc.drawings[drawingId];
  doc.drawingOrder = doc.drawingOrder.filter((id) => id !== drawingId);
}
