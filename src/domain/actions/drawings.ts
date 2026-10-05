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
 * (LNK-05). Its file in drawings/ is handled outside the document (see
 * features/drawings/drawing-files), so the removal can be undone.
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

/** The new file and page (or layout) of a drawing's next revision (DRW-07). */
export type DrawingRevision = Pick<
  Drawing,
  | 'fileName'
  | 'originalFileName'
  | 'fileHash'
  | 'fileType'
  | 'page'
  | 'layout'
  | 'isCadPlot'
  | 'size'
  | 'revision'
  | 'importedAt'
>;

/** Sheet sizes within a point of each other are the same sheet. */
export function sameSheetSize(a: Drawing['size'], b: Drawing['size']): boolean {
  return Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1;
}

/**
 * DRW-07, LNK-05: points a drawing at a new revision of its file. The drawing
 * keeps its id, so its markers, items, segment links and drawing links all
 * stay. When the sheet size changed, markers may no longer sit on their
 * symbols, so the drawing is flagged for review until the user clears it.
 * Returns whether the size changed.
 */
export function replaceDrawingRevision(
  doc: ProjectDoc,
  drawingId: string,
  next: DrawingRevision,
): boolean {
  const drawing = doc.drawings[drawingId];
  if (!drawing) return false;
  const sizeChanged = !sameSheetSize(drawing.size, next.size);
  Object.assign(drawing, next);
  if (sizeChanged) drawing.needsReview = true;
  return sizeChanged;
}

/** Clears a drawing's review flag once the user has checked its markers (DRW-07). */
export function markDrawingReviewed(doc: ProjectDoc, drawingId: string): void {
  const drawing = doc.drawings[drawingId];
  if (drawing?.needsReview) drawing.needsReview = false;
}
