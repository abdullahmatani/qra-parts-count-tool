/**
 * Text search in drawings (DRW-08): finds tag and line numbers among the text
 * boxes of a drawing. Matching ignores case, spaces and dashes, so "hv 1001"
 * and "HV1001" find "HV-1001". A tag drawn as separate runs on
 * one line ("HV-" and "1001") is found too.
 */

export interface TextBox {
  text: string;
  /** Box in drawing coordinates (y down). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Hyphens, dashes and minus signs, which drawings use interchangeably in tags. */
const DASHES = /[-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/** Lower case with spaces, underscores and dashes removed: "HV–1001" and "hv 1001" match. */
export function normaliseForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(DASHES, '')
    .replace(/[\s_]+/g, '');
}

function union(a: TextBox, b: TextBox): TextBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    text: `${a.text}${b.text}`,
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * Joins runs that sit next to each other on one line (same height band, a
 * gap under about half a character), for matching text split across runs.
 */
export function joinLines(boxes: readonly TextBox[]): TextBox[] {
  const sorted = [...boxes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
  const lines: TextBox[] = [];
  let current: TextBox | null = null;
  for (const box of sorted) {
    if (current) {
      const sameLine =
        Math.abs(current.y + current.height / 2 - (box.y + box.height / 2)) <
        0.35 * Math.max(current.height, box.height);
      const gap = box.x - (current.x + current.width);
      if (sameLine && gap < 0.6 * box.height && gap > -0.5 * box.height) {
        current = union(current, box);
        continue;
      }
      lines.push(current);
    }
    current = { ...box };
  }
  if (current) lines.push(current);
  return lines;
}

const contains = (outer: TextBox, inner: TextBox) =>
  inner.x >= outer.x - 0.01 &&
  inner.y >= outer.y - 0.01 &&
  inner.x + inner.width <= outer.x + outer.width + 0.01 &&
  inner.y + inner.height <= outer.y + outer.height + 0.01;

/** Boxes whose text contains the query, in reading order (top to bottom, left to right). */
export function findInText(boxes: readonly TextBox[], query: string): TextBox[] {
  const q = normaliseForSearch(query);
  if (!q) return [];
  const direct = boxes.filter((box) => normaliseForSearch(box.text).includes(q));
  // Runs joined per line catch tags split across runs; skip lines that only repeat a direct hit.
  const joined = joinLines(boxes).filter(
    (line) =>
      normaliseForSearch(line.text).includes(q) && !direct.some((hit) => contains(line, hit)),
  );
  return [...direct, ...joined].sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x);
}
