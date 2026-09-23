/**
 * Pre-fills drawing metadata from the text of a drawing (DRW-04): drawing
 * number, title, revision and sheet. Title blocks vary between clients, so this
 * is a best-effort guess that the user checks and corrects in the register.
 *
 * Strategy, for each field:
 * 1. find a label ("DRAWING NO.", "REV", "TITLE", "SHEET") and take the nearest
 *    plausible value below it or to its right;
 * 2. otherwise fall back to the largest plausible text in the title-block
 *    region (bottom-right of the sheet), or to the file name.
 */
import type { Size2D } from './schema/types';

export interface TextItem {
  text: string;
  /** Left edge, drawing coordinates (y down). */
  x: number;
  /** Baseline, drawing coordinates (y down). */
  y: number;
  width: number;
  /** Font size in drawing units. */
  size: number;
}

export interface TitleBlockGuess {
  drawingNo: string;
  title: string;
  revision: string;
  sheet: string;
}

const DRAWING_NO_LABEL = /^(drawing|dwg|doc(ument)?)\.?\s*(no|number|nr|#)\.?:?$/i;
const REV_LABEL = /^rev(ision)?\.?:?$/i;
const TITLE_LABEL = /^(drawing\s+)?title:?$/i;
const SHEET_LABEL = /^(sheet|sht)\.?(\s*no\.?)?:?$/i;

/** A drawing number: tokens separated by - _ . / with at least one digit, e.g. PEFS-1001-01. */
const DRAWING_NO = /^(?=.*\d)[A-Z0-9]{1,12}(?:[-_./][A-Z0-9]{1,12}){1,6}$/i;
const REVISION = /^[A-Z0-9]{1,3}$/i;
const SHEET = /^(\d{1,4})(\s*(of|\/)\s*\d{1,4})?$/i;

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Joins text runs that sit on the same baseline next to each other. */
export function mergeRuns(items: readonly TextItem[]): TextItem[] {
  const sorted = [...items]
    .map((item) => ({ ...item, text: normalise(item.text) }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const out: TextItem[] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    const gap = last ? item.x - (last.x + last.width) : Infinity;
    if (
      last &&
      Math.abs(last.y - item.y) < Math.max(1, item.size * 0.3) &&
      Math.abs(last.size - item.size) < item.size * 0.25 &&
      gap >= -item.size * 0.2 &&
      gap < item.size * 0.6
    ) {
      last.text = `${last.text}${gap > item.size * 0.15 ? ' ' : ''}${item.text}`;
      last.width = item.x + item.width - last.x;
    } else {
      out.push({ ...item });
    }
  }
  return out;
}

interface Candidate {
  item: TextItem;
  score: number;
}

/** Finds the value that belongs to a label: below it or to its right, the closer the better. */
function valueNear(
  label: TextItem,
  items: readonly TextItem[],
  accept: (text: string) => boolean,
): TextItem | null {
  let best: Candidate | null = null;
  const reach = Math.max(label.size * 12, 60);
  for (const item of items) {
    if (item === label || !accept(item.text)) continue;
    const dx = item.x - label.x;
    const dy = item.y - label.y; // positive: below the label
    const right = dx > label.width * 0.5 && Math.abs(dy) < Math.max(label.size, item.size) * 1.2;
    const below = dy > 0 && dx > -label.size * 2 && dx < reach * 3;
    if (!right && !below) continue;
    const distance = Math.hypot(dx, dy);
    if (distance > reach * 2.5) continue;
    // Prefer larger text (values are usually printed bigger than their labels).
    const score = distance - item.size * 2;
    if (!best || score < best.score) best = { item, score };
  }
  return best?.item ?? null;
}

function inTitleBlockRegion(item: TextItem, page: Size2D): boolean {
  return item.x > page.width * 0.55 && item.y > page.height * 0.7;
}

function largest(items: readonly TextItem[]): TextItem | null {
  return items.reduce<TextItem | null>(
    (best, item) => (!best || item.size > best.size ? item : best),
    null,
  );
}

/** Guesses a drawing number from a file name such as `PEFS-1001_A1.pdf`. */
export function drawingNoFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const tokens = stem.split(/[\s_]+/);
  const match = tokens.find((token) => DRAWING_NO.test(token));
  return match ?? '';
}

export function guessTitleBlock(
  rawItems: readonly TextItem[],
  page: Size2D,
  fileName = '',
): TitleBlockGuess {
  const items = mergeRuns(rawItems);
  const find = (label: RegExp, accept: (t: string) => boolean) => {
    const labels = items.filter((item) => label.test(item.text));
    // Prefer labels inside the title-block region.
    labels.sort(
      (a, b) => Number(inTitleBlockRegion(b, page)) - Number(inTitleBlockRegion(a, page)),
    );
    for (const labelItem of labels) {
      const value = valueNear(labelItem, items, accept);
      if (value) return value.text;
    }
    return '';
  };

  let drawingNo = find(DRAWING_NO_LABEL, (t) => DRAWING_NO.test(t));
  if (!drawingNo) {
    const inBlock = items.filter(
      (item) => inTitleBlockRegion(item, page) && DRAWING_NO.test(item.text),
    );
    drawingNo = largest(inBlock)?.text ?? '';
  }
  if (!drawingNo) drawingNo = drawingNoFromFileName(fileName);

  const revision = find(REV_LABEL, (t) => REVISION.test(t) && !REV_LABEL.test(t));
  const title = find(
    TITLE_LABEL,
    (t) => t.length >= 4 && /[a-z]{3}/i.test(t) && !DRAWING_NO.test(t) && !TITLE_LABEL.test(t),
  );
  // Keep the sheet number only ("2 OF 5" -> "2"); the drawing number plus sheet identifies the page.
  const sheet = find(SHEET_LABEL, (t) => SHEET.test(t)).match(SHEET)?.[1] ?? '';

  return { drawingNo, title, revision, sheet };
}
