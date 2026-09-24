/**
 * Symbol matching by example (roadmap #59, #60): finds the places on a
 * rendered drawing that look like a symbol the user has already counted.
 *
 * Classical normalised cross-correlation (NCC), coarse to fine, at four
 * rotations. It needs no trained model, so it runs offline on any drawing and
 * any client's symbol set; see docs/spikes/symbol-detection.md. Matches are
 * only suggestions: the user accepts or rejects each one.
 */

export interface InkImage {
  width: number;
  height: number;
  /** Ink per pixel, row by row: 0 is paper, 1 is solid black. */
  data: Float32Array;
}

export type MatchRotation = 0 | 90 | 180 | 270;

export interface SymbolMatch {
  /** The matched box in image pixels (rotated template size). */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: MatchRotation;
  /** Normalised cross-correlation: 1 is identical, 0 unrelated. */
  score: number;
}

export interface MatchOptions {
  /** Lowest score kept, 0–1. */
  minScore: number;
  /** Boxes (image pixels) of symbols already counted: no match is kept over them. */
  occupied?: readonly { x: number; y: number; width: number; height: number }[];
  rotations?: readonly MatchRotation[];
  /** At most this many matches, best first. */
  maxMatches?: number;
}

/** Coarse candidates kept per rotation before the fine check. */
const MAX_PEAKS = 400;
/** A window whose ink differs this much from the template's cannot match. */
const INK_RATIO = [0.6, 1.8] as const;
/** Matches sharing more than this part of their boxes are one symbol. */
const MAX_OVERLAP = 0.25;
/** The coarse search accepts this much less than the final score. */
const COARSE_SLACK = 0.2;

export function inkImage(width: number, height: number, data?: Float32Array): InkImage {
  return { width, height, data: data ?? new Float32Array(width * height) };
}

/** Ink from canvas pixels: dark and opaque is ink, light or transparent is paper. */
export function inkFromRgba(rgba: Uint8ClampedArray, width: number, height: number): InkImage {
  const image = inkImage(width, height);
  for (let i = 0; i < image.data.length; i += 1) {
    const p = i * 4;
    const luminance = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) / 255;
    image.data[i] = (rgba[p + 3]! / 255) * (1 - luminance);
  }
  return image;
}

/** The part of an image inside a box, clamped to the image. */
export function cropInk(image: InkImage, x: number, y: number, w: number, h: number): InkImage {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(image.width, Math.round(x + w));
  const y1 = Math.min(image.height, Math.round(y + h));
  const out = inkImage(Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  for (let row = 0; row < out.height; row += 1) {
    const from = (y0 + row) * image.width + x0;
    out.data.set(image.data.subarray(from, from + out.width), row * out.width);
  }
  return out;
}

/** The image turned clockwise by a multiple of 90°. */
export function rotateInk(image: InkImage, rotation: MatchRotation): InkImage {
  if (rotation === 0) return image;
  const { width: w, height: h, data } = image;
  const quarter = rotation === 90 || rotation === 270;
  const out = inkImage(quarter ? h : w, quarter ? w : h);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const [sx, sy] =
        rotation === 90
          ? [y, h - 1 - x]
          : rotation === 180
            ? [w - 1 - x, h - 1 - y]
            : [w - 1 - y, x];
      out.data[y * out.width + x] = data[sy * w + sx]!;
    }
  }
  return out;
}

/** Averages blocks of `factor` × `factor` pixels. */
export function downsample(image: InkImage, factor: number): InkImage {
  if (factor <= 1) return image;
  const out = inkImage(Math.floor(image.width / factor), Math.floor(image.height / factor));
  const area = factor * factor;
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      let sum = 0;
      for (let v = 0; v < factor; v += 1) {
        const row = (y * factor + v) * image.width + x * factor;
        for (let u = 0; u < factor; u += 1) sum += image.data[row + u]!;
      }
      out.data[y * out.width + x] = sum / area;
    }
  }
  return out;
}

/** Pixels darker than this count as part of a line. */
const LINE_INK = 0.35;

/**
 * Removes horizontal and vertical ink runs of at least `minLength` pixels:
 * pipes, borders and table rules. A straight run longer than the example box
 * cannot belong to the symbol, and without it a valve on a vertical line
 * matches one on a horizontal line.
 */
export function removeLongLines(image: InkImage, minLength: number): InkImage {
  const { width: w, height: h, data } = image;
  const out = inkImage(w, h, data.slice());
  const clear = (start: number, length: number, step: number) => {
    for (let k = 0; k < length; k += 1) out.data[start + k * step] = 0;
  };
  for (let y = 0; y < h; y += 1) {
    let run = 0;
    for (let x = 0; x <= w; x += 1) {
      if (x < w && data[y * w + x]! >= LINE_INK) run += 1;
      else {
        if (run >= minLength) clear(y * w + x - run, run, 1);
        run = 0;
      }
    }
  }
  for (let x = 0; x < w; x += 1) {
    let run = 0;
    for (let y = 0; y <= h; y += 1) {
      if (y < h && data[y * w + x]! >= LINE_INK) run += 1;
      else {
        if (run >= minLength) clear((y - run) * w + x, run, w);
        run = 0;
      }
    }
  }
  return out;
}

/** A 3 × 3 box blur, so thin lines a pixel apart still correlate. */
export function blur(image: InkImage): InkImage {
  const { width: w, height: h, data } = image;
  const across = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      across[i] = (data[i]! + (x > 0 ? data[i - 1]! : 0) + (x < w - 1 ? data[i + 1]! : 0)) / 3;
    }
  }
  const out = inkImage(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      out.data[i] =
        (across[i]! + (y > 0 ? across[i - w]! : 0) + (y < h - 1 ? across[i + w]! : 0)) / 3;
    }
  }
  return out;
}

/** Summed-area tables of ink and ink², for window sums in constant time. */
class Integral {
  readonly sum: Float64Array;
  readonly sq: Float64Array;
  private readonly stride: number;

  constructor(image: InkImage) {
    this.stride = image.width + 1;
    this.sum = new Float64Array(this.stride * (image.height + 1));
    this.sq = new Float64Array(this.stride * (image.height + 1));
    for (let y = 0; y < image.height; y += 1) {
      let row = 0;
      let rowSq = 0;
      for (let x = 0; x < image.width; x += 1) {
        const v = image.data[y * image.width + x]!;
        row += v;
        rowSq += v * v;
        const i = (y + 1) * this.stride + x + 1;
        this.sum[i] = this.sum[i - this.stride]! + row;
        this.sq[i] = this.sq[i - this.stride]! + rowSq;
      }
    }
  }

  window(table: Float64Array, x: number, y: number, w: number, h: number): number {
    const s = this.stride;
    return (
      table[(y + h) * s + x + w]! -
      table[y * s + x + w]! -
      table[(y + h) * s + x]! +
      table[y * s + x]!
    );
  }
}

/** A template with its mean removed, ready to correlate. */
class Template {
  readonly width: number;
  readonly height: number;
  readonly centred: Float32Array;
  readonly norm: number;
  readonly ink: number;

  constructor(image: InkImage) {
    this.width = image.width;
    this.height = image.height;
    let sum = 0;
    for (const v of image.data) sum += v;
    const mean = sum / image.data.length;
    this.centred = image.data.map((v) => v - mean);
    let sq = 0;
    for (const v of this.centred) sq += v * v;
    this.norm = Math.sqrt(sq);
    this.ink = sum;
  }
}

/** NCC of the template with the image window at (x, y); 0 where the window cannot match. */
function scoreAt(image: InkImage, integral: Integral, t: Template, x: number, y: number): number {
  const n = t.width * t.height;
  const sum = integral.window(integral.sum, x, y, t.width, t.height);
  if (sum < t.ink * INK_RATIO[0] || sum > t.ink * INK_RATIO[1]) return 0;
  const variance = integral.window(integral.sq, x, y, t.width, t.height) - (sum * sum) / n;
  if (variance <= 1e-9) return 0;
  let dot = 0;
  for (let v = 0; v < t.height; v += 1) {
    const row = (y + v) * image.width + x;
    const trow = v * t.width;
    for (let u = 0; u < t.width; u += 1) dot += t.centred[trow + u]! * image.data[row + u]!;
  }
  return dot / (t.norm * Math.sqrt(variance));
}

interface Peak {
  x: number;
  y: number;
  score: number;
}

/** Local maxima of the coarse score map at or above `min`, best first. */
function coarsePeaks(image: InkImage, t: Template, min: number): Peak[] {
  const integral = new Integral(image);
  const w = image.width - t.width + 1;
  const h = image.height - t.height + 1;
  if (w <= 0 || h <= 0) return [];
  const scores = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) scores[y * w + x] = scoreAt(image, integral, t, x, y);
  }
  const peaks: Peak[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const s = scores[y * w + x]!;
      if (s < min) continue;
      let best = true;
      for (let dy = -1; dy <= 1 && best; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) {
            const other = scores[ny * w + nx]!;
            // Ties go to the first in scan order.
            if (other > s || (other === s && (dy < 0 || (dy === 0 && dx < 0)))) {
              best = false;
              break;
            }
          }
        }
      }
      if (best) peaks.push({ x, y, score: s });
    }
  }
  return peaks.sort((a, b) => b.score - a.score).slice(0, MAX_PEAKS);
}

/** Best fine score within `radius` pixels of (x, y). */
function refine(
  image: InkImage,
  integral: Integral,
  t: Template,
  x: number,
  y: number,
  radius: number,
): Peak {
  let best: Peak = { x, y, score: -1 };
  for (
    let py = Math.max(0, y - radius);
    py <= Math.min(image.height - t.height, y + radius);
    py += 1
  ) {
    for (
      let px = Math.max(0, x - radius);
      px <= Math.min(image.width - t.width, x + radius);
      px += 1
    ) {
      const score = scoreAt(image, integral, t, px, py);
      if (score > best.score) best = { x: px, y: py, score };
    }
  }
  return best;
}

type Box = Pick<SymbolMatch, 'x' | 'y' | 'width' | 'height'>;

/** The part of the smaller box that the two boxes share. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.width * a.height, b.width * b.height);
}

/**
 * Keeps the best of overlapping matches, since a window shifted onto half a
 * symbol still scores well. Nothing is kept over an `occupied` box either.
 */
export function suppressOverlaps<T extends SymbolMatch>(
  matches: readonly T[],
  occupied: readonly Box[] = [],
): T[] {
  const kept: T[] = [];
  for (const m of [...matches].sort((a, b) => b.score - a.score)) {
    const clash = (k: Box) => overlap(k, m) > MAX_OVERLAP;
    if (!kept.some(clash) && !occupied.some(clash)) kept.push(m);
  }
  return kept;
}

/** Coarse level: templates at least 8 pixels across, blocks of at most 6. */
export function coarseFactor(template: InkImage): number {
  return Math.max(1, Math.min(6, Math.floor(Math.min(template.width, template.height) / 8)));
}

/**
 * Where `template` appears in `image`: every match scoring at least
 * `minScore`, best first, overlapping matches merged. Includes the template's
 * own place if it was cut from the image.
 */
export function findMatches(
  image: InkImage,
  template: InkImage,
  options: MatchOptions,
): SymbolMatch[] {
  const rotations = options.rotations ?? [0, 90, 180, 270];
  const factor = coarseFactor(template);
  // Blurred images find candidates; the final score compares the sharp shapes,
  // so a blob of about the right size in about the right place does not pass.
  const sharpIntegral = new Integral(image);
  const fineImage = blur(image);
  const fineIntegral = new Integral(fineImage);
  const coarseImage = downsample(fineImage, factor);
  const matches: SymbolMatch[] = [];
  for (const rotation of rotations) {
    const turned = rotateInk(template, rotation);
    const blurred = blur(turned);
    const sharp = new Template(turned);
    const fine = new Template(blurred);
    const coarse = new Template(downsample(blurred, factor));
    if (sharp.norm < 1e-6 || fine.norm < 1e-6 || coarse.norm < 1e-6) continue;
    const peaks = coarsePeaks(coarseImage, coarse, Math.max(0.2, options.minScore - COARSE_SLACK));
    for (const peak of peaks) {
      const near = refine(
        fineImage,
        fineIntegral,
        fine,
        peak.x * factor,
        peak.y * factor,
        factor + 1,
      );
      if (near.score < options.minScore) continue;
      const best = refine(image, sharpIntegral, sharp, near.x, near.y, 1);
      if (best.score >= options.minScore) {
        matches.push({
          x: best.x,
          y: best.y,
          width: sharp.width,
          height: sharp.height,
          rotation,
          score: Math.min(1, best.score),
        });
      }
    }
  }
  return suppressOverlaps(matches, options.occupied).slice(0, options.maxMatches ?? 300);
}

/**
 * Where the symbol inside `box` (image pixels) appears elsewhere in `image`,
 * with long straight lines taken out of both first. The symbol's own place is
 * found too unless `options.occupied` covers it.
 */
export function matchExample(
  image: InkImage,
  box: { x: number; y: number; width: number; height: number },
  options: MatchOptions,
): SymbolMatch[] {
  const clean = removeLongLines(image, Math.ceil(Math.max(box.width, box.height)));
  const template = cropInk(clean, box.x, box.y, box.width, box.height);
  return findMatches(clean, template, options);
}
