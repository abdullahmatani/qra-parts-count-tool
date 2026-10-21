/**
 * Dragging a drawing in the organised drawing list onto a plant unit
 * (DRW-11). The drag carries the drawing's id under a type of its own, so
 * file drops on the workspace and text drops on inputs ignore it.
 */
import type { DragEvent } from 'react';

const DRAWING_TYPE = 'application/x-qrapc-drawing';

/** Starts dragging a drawing. */
export function startDrawingDrag(event: DragEvent, drawingId: string): void {
  event.dataTransfer.setData(DRAWING_TYPE, drawingId);
  event.dataTransfer.effectAllowed = 'move';
}

/** Whether a drag over an element carries a drawing (its id is only readable on drop). */
export function isDrawingDrag(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(DRAWING_TYPE);
}

/** The id of the drawing dropped, or null when the drop is not a drawing. */
export function droppedDrawing(event: DragEvent): string | null {
  return event.dataTransfer.getData(DRAWING_TYPE) || null;
}
