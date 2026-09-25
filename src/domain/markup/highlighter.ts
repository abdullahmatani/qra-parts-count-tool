/**
 * Highlighter pens: strokes painted over a segment's pipework and equipment
 * in the segment's colour. Pen widths are fractions of the drawing's longer
 * side, so a stroke covers the same part of the sheet at any zoom and in the
 * annotated PDF.
 */
import type { Size2D, StrokeGeometry } from '../schema/types';

export type HighlighterPen = 'fine' | 'medium' | 'broad';

export const HIGHLIGHTER_PENS: readonly HighlighterPen[] = ['fine', 'medium', 'broad'];

/** On an A1 sheet (2384 pt): 8, 16 and 32 pt, about 3, 6 and 11 mm. */
const FRACTION: Record<HighlighterPen, number> = {
  fine: 1 / 300,
  medium: 1 / 150,
  broad: 1 / 75,
};

/** A pen's width in drawing units on a sheet. */
export function penWidth(pen: HighlighterPen, sheet: Size2D): number {
  return Math.max(sheet.width, sheet.height) * FRACTION[pen];
}

/** The pen a stroke was drawn with, or null when its width matches none. */
export function strokePen(stroke: StrokeGeometry, sheet: Size2D): HighlighterPen | null {
  return (
    HIGHLIGHTER_PENS.find(
      (pen) => Math.abs(penWidth(pen, sheet) - stroke.width) <= stroke.width * 0.01,
    ) ?? null
  );
}
