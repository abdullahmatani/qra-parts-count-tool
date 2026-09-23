import type { Drawing } from './schema/types';

/** Short name for a drawing in lists and tabs: drawing number (or file name) and sheet. */
export function drawingDisplayName(
  drawing: Pick<Drawing, 'drawingNo' | 'fileName' | 'sheet'>,
): string {
  const base = drawing.drawingNo || drawing.fileName;
  return drawing.sheet ? `${base} / ${drawing.sheet}` : base;
}
