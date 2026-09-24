/**
 * Suggested drawing links (LNK-06): text on a drawing that names another
 * drawing in the register, such as an off-page connector "TO PEFS-1002",
 * becomes a candidate link hotspot for the user to review.
 */
import type { Drawing, DrawingLink } from './schema/types';
import { joinLines, normaliseForSearch, type TextBox } from './text-search';

export interface LinkSuggestion {
  sourceDrawingId: string;
  targetDrawingId: string;
  /** Hotspot in the source drawing's coordinates. */
  rect: { x: number; y: number; width: number; height: number };
  /** The text that named the target. */
  text: string;
}

/** Drawing numbers shorter than this match too much to be useful. */
const MIN_KEY_LENGTH = 4;

/** Where `key` occurs in `text` and does not run on into more digits (PEFS-1001 ≠ PEFS-10012). */
function occursIn(text: string, key: string): boolean {
  for (let at = text.indexOf(key); at >= 0; at = text.indexOf(key, at + 1)) {
    const next = text[at + key.length];
    if (!(next && /\d/.test(next) && /\d$/.test(key))) return true;
  }
  return false;
}

const overlaps = (a: LinkSuggestion['rect'], b: DrawingLink['rect']) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function suggestLinks(
  drawings: readonly Drawing[],
  textByDrawing: ReadonlyMap<string, readonly TextBox[]>,
  links: readonly DrawingLink[],
): LinkSuggestion[] {
  // The first drawing in register order stands for a number used by several sheets.
  const byKey = new Map<string, Drawing>();
  for (const drawing of drawings) {
    const key = normaliseForSearch(drawing.drawingNo);
    if (key.length >= MIN_KEY_LENGTH && !byKey.has(key)) byKey.set(key, drawing);
  }
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length);
  const suggestions: LinkSuggestion[] = [];

  for (const source of drawings) {
    const ownKey = normaliseForSearch(source.drawingNo);
    const existing = links.filter((link) => link.sourceDrawingId === source.id);
    for (const line of joinLines(textByDrawing.get(source.id) ?? [])) {
      const text = normaliseForSearch(line.text);
      // The longest number that occurs, so PEFS-1001-A wins over PEFS-1001.
      const key = keys.find((k) => k !== ownKey && occursIn(text, k));
      const target = key ? byKey.get(key) : undefined;
      if (!target || target.id === source.id) continue;
      const pad = Math.max(4, line.height * 0.3);
      const rect = {
        x: line.x - pad,
        y: line.y - pad,
        width: line.width + 2 * pad,
        height: line.height + 2 * pad,
      };
      if (existing.some((link) => overlaps(rect, link.rect))) continue;
      suggestions.push({
        sourceDrawingId: source.id,
        targetDrawingId: target.id,
        rect,
        text: line.text.trim(),
      });
    }
  }
  return suggestions;
}
