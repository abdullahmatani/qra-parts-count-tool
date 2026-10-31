/**
 * Line sizes written on a drawing (CNT-01): a PEFS or P&ID names each line
 * with a line number that carries its nominal size, such as 6"-P-1001-A1A,
 * 1-1/2"-HC-2003-B1, DN150-P-1001 or, on metric drawings, 150-P-1001-A1, and
 * marks some small lines with a size alone (3/4", DN20, 2" DRAIN). This reads
 * those labels from the drawing text. A reducer callout (6"x4") names two
 * sizes and is left out, as is any other text. Which pipe each label sits on
 * is worked out on the rendered sheet (domain/markup/line-sizes.ts).
 */
import type { EquipmentCategory, EquipmentType, SizeUnit } from './schema/types';
import { isStandardDn, type NominalSize } from './sizes';
import { joinLines, type TextBox } from './text-search';

/** A line number, or a size written on its own (or with a word, as in 2" DRAIN). */
export type SizeLabelKind = 'lineNumber' | 'size';

export interface ParsedSizeLabel {
  size: NominalSize;
  kind: SizeLabelKind;
}

export interface SizeLabel extends ParsedSizeLabel {
  /** The text as written on the drawing. */
  text: string;
  /** Box in drawing coordinates (y down). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text running up or down the sheet, as along a vertical line. */
  vertical: boolean;
}

/** Labels longer than this are notes, not line numbers. */
const MAX_LENGTH = 48;
const MAX_WORDS = 5;

const VULGAR: Readonly<Record<string, string>> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

/** Upper case, one kind of dash, quote and fraction slash, single spaces. */
function normalise(text: string): string {
  return text
    .replace(/(\d)?([¼½¾⅛⅜⅝⅞])/g, (_, whole: string | undefined, part: string) =>
      whole ? `${whole}-${VULGAR[part]}` : VULGAR[part]!,
    )
    .normalize('NFKC')
    .replace(/⁄/g, '/')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/′′|''|[″”“‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** 1-1/2, 1 1/2, 3/4, 0.75 or 6. */
const NUMBER = String.raw`\d+[- ]\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+`;
/** Not part of a longer number: 1001-6" is 6", not 1001-6. */
const START = String.raw`(?<![\d./])`;
const INCH = new RegExp(String.raw`${START}(${NUMBER}) ?(?:"|IN(?:CH(?:ES)?)?(?![A-Z]))`, 'g');
const NPS = new RegExp(String.raw`(?<![A-Z])NPS ?(${NUMBER})(?![\d/])`, 'g');
const NB = new RegExp(String.raw`${START}(${NUMBER}) ?NB(?![A-Z])`, 'g');
const DN = /(?<![A-Z])DN ?(\d{1,4})(?![\d.])/g;
/** Two sizes either side of an x: a reducer (6"x4", DN150 x DN100). */
const REDUCER = new RegExp(
  String.raw`(?:${NUMBER}|DN ?\d+) ?"? ?[X×] ?(?:DN ?)?(?:${NUMBER}) ?(?:"|NB|IN\b)?`,
);
/** A metric line number with no unit: size, fluid code, number and more (150-P-1001-A1). */
const METRIC = /^(\d{2,4}) ?- ?[A-Z]{1,6} ?- ?\d{2,}[A-Z0-9]* ?- ?[A-Z0-9]/;

function parseNumber(text: string): number | null {
  const mixed = /^(\d+)[- ](\d+)\/(\d+)$/.exec(text);
  if (mixed)
    return Number(mixed[3]) ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : null;
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

interface Found {
  size: NominalSize;
  start: number;
  end: number;
}

function sizesIn(text: string): Found[] {
  const found: Found[] = [];
  const add = (match: RegExpExecArray, size: NominalSize | null) => {
    if (!size || !(size.value > 0)) return;
    const start = match.index;
    const end = start + match[0].length;
    // Two patterns can read the same characters (6 NB is not also 6").
    if (found.some((f) => start < f.end && f.start < end)) return;
    found.push({ size, start, end });
  };
  for (const m of text.matchAll(DN)) {
    const value = Number(m[1]);
    add(m, isStandardDn(value) ? { value, unit: 'DN' } : null);
  }
  for (const m of text.matchAll(NB)) {
    const value = parseNumber(m[1]!);
    // 150NB is DN150; 6NB is 6".
    const metric = value !== null && Number.isInteger(value) && value >= 15 && isStandardDn(value);
    add(m, value === null ? null : { value, unit: metric ? 'DN' : 'in' });
  }
  for (const m of text.matchAll(NPS)) {
    const value = parseNumber(m[1]!);
    add(m, value === null ? null : { value, unit: 'in' });
  }
  for (const m of text.matchAll(INCH)) {
    const value = parseNumber(m[1]!);
    add(m, value === null ? null : { value, unit: 'in' });
  }
  return found.sort((a, b) => a.start - b.start);
}

const sameSize = (a: NominalSize, b: NominalSize) => a.value === b.value && a.unit === b.unit;

/**
 * The size a label on a drawing gives its line, or null when the text is not
 * a line number or size label. A bare number at the start of a metric line
 * number (150-P-1001-A1) counts only when the project enters sizes in DN.
 */
export function parseSizeLabel(raw: string, projectUnit: SizeUnit): ParsedSizeLabel | null {
  const text = normalise(raw);
  if (!text || text.length > MAX_LENGTH || text.split(' ').length > MAX_WORDS) return null;
  if (REDUCER.test(text)) return null;
  const found = sizesIn(text);
  if (found.length === 0) {
    const metric = projectUnit === 'DN' ? METRIC.exec(text) : null;
    const value = metric ? Number(metric[1]) : 0;
    return metric && value >= 15 && isStandardDn(value)
      ? { size: { value, unit: 'DN' }, kind: 'lineNumber' }
      : null;
  }
  const [first] = found;
  if (!first || found.some((f) => !sameSize(f.size, first.size))) return null;
  const before = text.slice(0, first.start).trim();
  const after = text.slice(first.end).trim();
  if (!before && !after) return { size: first.size, kind: 'size' };
  if (!before) {
    // The size starts the label: 6"-P-1001-A1, 6" P-1001, 2" DRAIN.
    if (!/^[- _]/.test(text.slice(first.end))) return null;
    const rest = after.replace(/^[-_ ]+/, '');
    if (/\d/.test(rest) && /[A-Z]/.test(rest)) return { size: first.size, kind: 'lineNumber' };
    if (/^[A-Z][A-Z .]*$/.test(rest) && rest.split(' ').length <= 2) {
      return { size: first.size, kind: 'size' };
    }
    return null;
  }
  // The size inside a line number written as one code: P-1001-6"-A1A.
  const code = /^[A-Z0-9][A-Z0-9\-/".]*$/.test(text);
  const between = before.endsWith('-') && (after === '' || after.startsWith('-'));
  return code && between && /\d/.test(before) ? { size: first.size, kind: 'lineNumber' } : null;
}

/** Whether a text box runs up or down the sheet; guessed from its shape when not known. */
function isVertical(box: TextBox): boolean {
  if (box.vertical !== undefined) return box.vertical;
  // About half a character height per character along the text.
  const expected = 0.55 * box.text.trim().length;
  const across = Math.abs(box.width / Math.max(box.height, 1e-9) - expected);
  const up = Math.abs(box.height / Math.max(box.width, 1e-9) - expected);
  return box.text.trim().length > 2 && up < across;
}

const contains = (outer: TextBox, inner: TextBox) =>
  inner.x >= outer.x - 0.01 &&
  inner.y >= outer.y - 0.01 &&
  inner.x + inner.width <= outer.x + outer.width + 0.01 &&
  inner.y + inner.height <= outer.y + outer.height + 0.01;

/**
 * The size labels among a drawing's text boxes. A label split across text
 * runs on one line (6" and -P-1001-A1) is read as one.
 */
export function sizeLabels(boxes: readonly TextBox[], projectUnit: SizeUnit): SizeLabel[] {
  const read = (box: TextBox, vertical: boolean): SizeLabel[] => {
    const parsed = parseSizeLabel(box.text, projectUnit);
    return parsed
      ? [
          {
            ...parsed,
            text: box.text.trim(),
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            vertical,
          },
        ]
      : [];
  };
  const joined = joinLines(boxes.filter((box) => !isVertical(box))).flatMap((line) =>
    read(line, false),
  );
  // A run read on its own is kept when no joined line reads it already.
  const direct = boxes
    .flatMap((box) => read(box, isVertical(box)))
    .filter((hit) => hit.vertical || !joined.some((line) => contains(line, hit)));
  return [...direct, ...joined].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Where an item of a category takes its size from on the drawing: the line
 * it sits on (valves, flanges), only a size written beside it (small-bore
 * connections and instruments, whose line is not theirs; equipment, where
 * lines of several sizes meet), or nowhere when its type needs no size. An
 * item with no type yet is taken for an inline fitting.
 */
export function sizeSourceOf(
  type: Pick<EquipmentType, 'category' | 'sizeRequired'> | undefined,
): 'line' | 'own' | null {
  if (!type) return 'line';
  if (!type.sizeRequired) return null;
  return LINE_SIZED.has(type.category) ? 'line' : 'own';
}

/** Categories whose items are the size of the line they are on. */
const LINE_SIZED: ReadonlySet<EquipmentCategory> = new Set(['valve', 'flange', 'pipe']);

/** Categories the line runs on through: everything else is equipment it ends at. */
const INLINE: ReadonlySet<EquipmentCategory> = new Set([
  'valve',
  'flange',
  'smallBore',
  'instrument',
  'pipe',
]);

/** Whether the pipe runs on through an item of this type (an item with no type is taken to). */
export function isInline(type: Pick<EquipmentType, 'category'> | undefined): boolean {
  return !type || INLINE.has(type.category);
}
