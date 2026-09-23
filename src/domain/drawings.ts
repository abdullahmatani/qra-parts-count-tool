import type { Drawing } from './schema/types';

/** Short name for a drawing in lists and tabs: drawing number (or file name) and sheet. */
export function drawingDisplayName(
  drawing: Pick<Drawing, 'drawingNo' | 'fileName' | 'sheet'>,
): string {
  const base = drawing.drawingNo || drawing.fileName;
  return drawing.sheet ? `${base} / ${drawing.sheet}` : base;
}

const PAPER_SIZES_MM: [string, number, number][] = [
  ['A0', 841, 1189],
  ['A1', 594, 841],
  ['A2', 420, 594],
  ['A3', 297, 420],
  ['A4', 210, 297],
  ['ANSI E', 864, 1118],
  ['ANSI D', 559, 864],
  ['ANSI C', 432, 559],
  ['ANSI B', 279, 432],
  ['Letter', 216, 279],
];

/** Names the paper size of a drawing in points (e.g. "A1"), or gives it in mm. */
export function paperSizeName(size: { width: number; height: number }): string {
  const toMm = (pt: number) => (pt * 25.4) / 72;
  const short = Math.min(toMm(size.width), toMm(size.height));
  const long = Math.max(toMm(size.width), toMm(size.height));
  for (const [name, w, h] of PAPER_SIZES_MM) {
    if (Math.abs(short - w) / w < 0.02 && Math.abs(long - h) / h < 0.02) return name;
  }
  return `${Math.round(toMm(size.width))} × ${Math.round(toMm(size.height))} mm`;
}
