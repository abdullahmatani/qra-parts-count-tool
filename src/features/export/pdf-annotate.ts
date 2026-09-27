/**
 * Annotated PDF pages (EXP-03, EXP-04, NFR-07). Markers, labels, a legend and
 * a stamp are drawn as vector content on top of the original page, which is
 * copied unchanged, so nothing is rasterised. CAD drawings are drawn from
 * their display lists as vector paths at the layout's paper size.
 *
 * All overlay drawing happens in drawing coordinates (the page as displayed:
 * origin top-left, y down, points), mapped to PDF user space with one matrix.
 */
import {
  LineCapStyle,
  PDFContentStream,
  LineJoinStyle,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  appendBezierCurve,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  endPath,
  endText,
  fill,
  lineTo,
  moveText,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
  type PDFDocument,
  type PDFFont,
  type PDFName,
  type PDFPage,
} from 'pdf-lib';
import {
  doubleLineStrokes,
  doubleLineTop,
  symbolPolygon,
  type SymbolStyle,
} from '@/domain/markup/geometry';
import { DOT_ALPHA, HIGHLIGHTER_ALPHA, hexToRgb01, MARKER_WARNING } from '@/domain/palette';
import type { Overlay } from '@/domain/export/pdf-plan';
import type { MarkerGeometry, Size2D } from '@/domain/schema/types';
import type { CadColorMode } from '@/store/preferences';
import { displayColor } from '@/features/cad/cad-source';
import type { DisplayList, TextRun } from '@/features/cad/display-list';

export type Matrix = [number, number, number, number, number, number];

/**
 * The PDF.js viewport transform at scale 1 (PDF user space → drawing
 * coordinates) for a page's view box and rotation, so exported markers land
 * exactly where they were placed on screen.
 */
export function viewportTransform(view: readonly number[], rotation: number): Matrix {
  const [x0, y0, x1, y1] = view as [number, number, number, number];
  const cx = (x1 + x0) / 2;
  const cy = (y1 + y0) / 2;
  const r = ((rotation % 360) + 360) % 360;
  const [a, b, c, d] =
    r === 90
      ? [0, 1, 1, 0]
      : r === 180
        ? [-1, 0, 0, 1]
        : r === 270
          ? [0, -1, -1, 0]
          : [1, 0, 0, -1];
  const swap = a === 0;
  const offsetX = swap ? Math.abs(cy - y0) : Math.abs(cx - x0);
  const offsetY = swap ? Math.abs(cx - x0) : Math.abs(cy - y0);
  return [a, b, c, d, offsetX - a * cx - c * cy, offsetY - b * cx - d * cy];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

type Ops = PDFOperator[];

function colour(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb01(hex);
  return [r, g, b];
}

const KAPPA = 0.5522847498;

function circlePath(ops: Ops, cx: number, cy: number, r: number): void {
  const k = r * KAPPA;
  ops.push(
    moveTo(cx + r, cy),
    appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    closePath(),
  );
}

/** A marker's outline; circles take their symbol's shape, as on screen. */
function geometryPath(ops: Ops, g: MarkerGeometry, style?: SymbolStyle): void {
  const polygon = g.type === 'circle' ? symbolPolygon(g, style) : null;
  if (polygon) {
    polygon.forEach(({ x, y }, i) => ops.push(i === 0 ? moveTo(x, y) : lineTo(x, y)));
    ops.push(closePath());
  } else if (g.type === 'circle') circlePath(ops, g.cx, g.cy, g.r);
  else if (g.type === 'rect') ops.push(rectangle(g.x, g.y, g.width, g.height));
  else if (g.type === 'doubleLine') {
    for (const [a, b] of doubleLineStrokes(g)) ops.push(moveTo(a.x, a.y), lineTo(b.x, b.y));
  } else {
    g.points.forEach(([x, y], i) => ops.push(i === 0 ? moveTo(x, y) : lineTo(x, y)));
  }
}

/**
 * Adds operators to a page as a content stream of their own. `pushOperators`
 * takes them as arguments, which overflows the stack when there are many.
 */
function addContent(page: PDFPage, ops: Ops): void {
  const { context } = page.doc;
  page.node.addContentStream(context.register(PDFContentStream.of(context.obj({}), ops)));
}

function alphaState(page: PDFPage, fillAlpha: number, strokeAlpha = 1): PDFName {
  return page.node.newExtGState(
    'GS',
    page.doc.context.obj({ Type: 'ExtGState', ca: fillAlpha, CA: strokeAlpha }),
  );
}

/** Characters the standard fonts can show (WinAnsi); others become "?". */
function encodable(font: PDFFont, text: string, cache: Map<string, boolean>): string {
  let out = '';
  for (const ch of text) {
    let ok = cache.get(ch);
    if (ok === undefined) {
      try {
        font.encodeText(ch);
        ok = true;
      } catch {
        ok = false;
      }
      cache.set(ch, ok);
    }
    out += ok ? ch : '?';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  /** Whether each character can be encoded (WinAnsi). */
  cache: Map<string, boolean>;
  /** Resource names on the current page. */
  keys: Map<PDFFont, PDFName>;
}

export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    cache: new Map(),
    keys: new Map(),
  };
}

function textOps(
  ops: Ops,
  fonts: Fonts,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  fillHex: string,
): void {
  const encoded = font.encodeText(encodable(font, text, fonts.cache));
  ops.push(
    setFillingRgbColor(...colour(fillHex)),
    beginText(),
    setFontAndSize(fontKey(fonts, font), size),
    // Drawing coordinates run y down, so the text matrix flips it back upright.
    setTextMatrix(1, 0, 0, -1, x, y),
    showText(encoded),
    endText(),
  );
}

/** The resource name a font has on the page being drawn (set by `registerFonts`). */
function fontKey(fonts: Fonts, font: PDFFont): PDFName {
  const key = fonts.keys.get(font);
  if (!key) throw new Error('Font not registered on the page');
  return key;
}

/** Adds the fonts to a page's resources; each page picks its own free names. */
function registerFonts(page: PDFPage, fonts: Fonts): void {
  fonts.keys.clear();
  for (const font of [fonts.regular, fonts.bold]) {
    fonts.keys.set(font, page.node.newFontDictionary(font.name, font.ref));
  }
}

/** Baseline start of a marker's label: right of a circle, above an area, run or double line. */
export function labelAnchor(g: MarkerGeometry, size: number, k: number): [number, number] {
  if (g.type === 'circle') return [g.cx + g.r + 2 * k, g.cy + size * 0.35];
  if (g.type === 'rect') return [g.x, g.y - 2 * k];
  if (g.type === 'doubleLine') {
    const top = doubleLineTop(g);
    return [top.x + 2 * k, top.y - 2 * k];
  }
  const [x, y] = g.points[0] ?? [0, 0];
  return [x + 2 * k, y - 2 * k];
}

/** Sizes scale with the sheet: an A3 sheet gets the base size, an A1 twice it. */
export function sheetScale(size: Size2D): number {
  return Math.min(3, Math.max(0.6, Math.max(size.width, size.height) / 1190.55));
}

/**
 * Draws markers, labels, a legend (top left) and a stamp (top right) on a
 * page. `toUser` maps drawing coordinates to the page's PDF user space.
 */
export function drawOverlay(
  page: PDFPage,
  fonts: Fonts,
  overlay: Overlay,
  toUser: Matrix,
  drawingSize: Size2D,
): void {
  registerFonts(page, fonts);
  const k = sheetScale(drawingSize);
  const ops: Ops = [
    pushGraphicsState(),
    concatTransformationMatrix(...toUser),
    setLineJoin(LineJoinStyle.Round),
  ];
  const faint = alphaState(page, 0.08);
  const dotFill = alphaState(page, DOT_ALPHA);
  const highlighter = alphaState(page, 1, HIGHLIGHTER_ALPHA);
  const run = alphaState(page, 1, 0.18);
  const solid = alphaState(page, 1, 1);

  // Circles and ESDV double lines go on top of the highlights and runs.
  const onTop = (m: Overlay['markers'][number]) =>
    m.geometry.type === 'circle' || m.geometry.type === 'doubleLine';
  const areas = overlay.markers.filter((m) => !onTop(m));
  const symbols = overlay.markers.filter(onTop);
  // Highlighter strokes first, under everything else, as on screen.
  const strokes = areas.filter((m) => m.geometry.type === 'stroke');
  for (const m of strokes) {
    if (m.geometry.type !== 'stroke') continue;
    const width = m.geometry.width;
    ops.push(setLineCap(LineCapStyle.Round), setDashPattern([], 0));
    if (m.warning) {
      ops.push(
        setGraphicsState(solid),
        setStrokingRgbColor(...colour(MARKER_WARNING)),
        setLineWidth(width + 3.5 * k),
      );
      geometryPath(ops, m.geometry);
      ops.push(stroke());
    }
    ops.push(
      setGraphicsState(highlighter),
      setStrokingRgbColor(...colour(m.colour)),
      setLineWidth(width),
    );
    geometryPath(ops, m.geometry);
    ops.push(stroke(), setLineCap(LineCapStyle.Butt));
  }

  const outlined = areas.filter((m) => m.geometry.type !== 'stroke');
  for (const m of [...outlined, ...symbols]) {
    const [r, g, b] = colour(m.colour);
    const dot = m.geometry.type === 'circle' && m.symbol === 'dot';
    if (m.warning) {
      ops.push(
        setGraphicsState(solid),
        setStrokingRgbColor(...colour(MARKER_WARNING)),
        setDashPattern([], 0),
        setLineWidth(3.5 * k),
      );
      geometryPath(ops, m.geometry, m);
      ops.push(stroke());
    }
    if (m.geometry.type === 'polyline') {
      ops.push(
        setGraphicsState(run),
        setStrokingRgbColor(r, g, b),
        setLineCap(LineCapStyle.Round),
        setDashPattern([], 0),
        setLineWidth(7 * k),
      );
      geometryPath(ops, m.geometry);
      ops.push(stroke(), setLineCap(LineCapStyle.Butt));
    }
    if (m.geometry.type !== 'polyline' && m.geometry.type !== 'doubleLine') {
      ops.push(setGraphicsState(dot ? dotFill : faint), setFillingRgbColor(r, g, b));
      geometryPath(ops, m.geometry, m);
      ops.push(fill());
    }
    // An ESDV double line is solid, and lighter than a ring so its gap shows.
    const line = m.geometry.type === 'doubleLine';
    const circle = m.geometry.type === 'circle';
    const dash = circle ? m.dash.map((d) => d * k) : line ? [] : [6 * k, 3.5 * k];
    const width = line ? 1.5 : m.esdv ? 2.2 : dot ? 0.8 : circle ? 1.5 : 1.8;
    ops.push(
      setGraphicsState(solid),
      setStrokingRgbColor(r, g, b),
      setDashPattern(dash, 0),
      setLineWidth(width * k),
    );
    geometryPath(ops, m.geometry, m);
    ops.push(stroke());
  }
  ops.push(setDashPattern([], 0), setGraphicsState(solid));

  // Labels (ANN-05) beside each marker, on a white backing so they stay
  // readable over linework (a text halo would duplicate the text on copy).
  const labelSize = 6.5 * k;
  const backing = alphaState(page, 0.85);
  for (const m of overlay.markers) {
    if (!m.label) continue;
    const [x, y] = labelAnchor(m.geometry, labelSize, k);
    const width = fonts.bold.widthOfTextAtSize(
      encodable(fonts.bold, m.label, fonts.cache),
      labelSize,
    );
    ops.push(
      pushGraphicsState(),
      setGraphicsState(backing),
      setFillingRgbColor(1, 1, 1),
      rectangle(x - k, y - labelSize * 0.85, width + 2 * k, labelSize * 1.1),
      fill(),
      popGraphicsState(),
    );
    textOps(ops, fonts, fonts.bold, m.label, x, y, labelSize, m.colour);
  }

  // Legend (top left) and stamp (top right).
  const pad = 6 * k;
  const line = 10 * k;
  const size = 7 * k;
  const margin = 12 * k;
  if (overlay.legend.length) {
    const width =
      Math.max(
        fonts.bold.widthOfTextAtSize(encodable(fonts.bold, overlay.legendTitle, fonts.cache), size),
        ...overlay.legend.map((e) =>
          fonts.regular.widthOfTextAtSize(encodable(fonts.regular, e.label, fonts.cache), size),
        ),
      ) +
      2 * pad +
      18 * k;
    const height = (overlay.legend.length + 1) * line + 2 * pad;
    panel(ops, page, margin, margin, width, height, k);
    textOps(
      ops,
      fonts,
      fonts.bold,
      overlay.legendTitle,
      margin + pad,
      margin + pad + size,
      size,
      '#111827',
    );
    overlay.legend.forEach((entry, i) => {
      const cy = margin + pad + (i + 1) * line + size * 0.6;
      const sx = margin + pad + 5 * k;
      const [r, g, b] = colour(entry.colour);
      const width =
        entry.kind === 'esdvLine'
          ? 1.4
          : entry.kind === 'esdv'
            ? 2
            : entry.kind === 'warning'
              ? 2.5
              : 1.3;
      ops.push(
        setStrokingRgbColor(r, g, b),
        setLineWidth(width * k),
        setDashPattern(
          entry.dash.map((d) => d * k * 0.6),
          0,
        ),
      );
      if (entry.kind === 'esdvLine') {
        for (const x of [sx - 1.3 * k, sx + 1.3 * k]) {
          ops.push(moveTo(x, cy - 3.5 * k), lineTo(x, cy + 3.5 * k));
        }
      } else {
        circlePath(ops, sx, cy, 3.5 * k);
      }
      ops.push(stroke());
      ops.push(setDashPattern([], 0));
      textOps(
        ops,
        fonts,
        fonts.regular,
        entry.label,
        margin + pad + 14 * k,
        cy + size * 0.35,
        size,
        '#111827',
      );
    });
  }
  if (overlay.stamp.length) {
    const width =
      Math.max(
        ...overlay.stamp.map((s, i) =>
          (i === 0 ? fonts.bold : fonts.regular).widthOfTextAtSize(
            encodable(i === 0 ? fonts.bold : fonts.regular, s, fonts.cache),
            size,
          ),
        ),
      ) +
      2 * pad;
    const height = overlay.stamp.length * line + 2 * pad - (line - size);
    const x = drawingSize.width - margin - width;
    panel(ops, page, x, margin, width, height, k);
    overlay.stamp.forEach((text, i) => {
      textOps(
        ops,
        fonts,
        i === 0 ? fonts.bold : fonts.regular,
        text,
        x + pad,
        margin + pad + size + i * line,
        size,
        '#111827',
      );
    });
  }
  ops.push(popGraphicsState());
  addContent(page, ops);
}

function panel(ops: Ops, page: PDFPage, x: number, y: number, w: number, h: number, k: number) {
  ops.push(
    pushGraphicsState(),
    setGraphicsState(alphaState(page, 0.92)),
    setFillingRgbColor(1, 1, 1),
    rectangle(x, y, w, h),
    fill(),
    popGraphicsState(),
    setStrokingRgbColor(0.55, 0.58, 0.62),
    setLineWidth(0.8 * k),
    setDashPattern([], 0),
    rectangle(x, y, w, h),
    stroke(),
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * Copies a PDF page into `out` unchanged (NFR-07) and draws the overlay on it
 * in the coordinates the viewer used for the markers.
 */
export async function addAnnotatedPdfPage(
  out: PDFDocument,
  source: PDFDocument,
  pageIndex: number,
  fonts: Fonts,
  overlay: Overlay,
): Promise<PDFPage> {
  const [page] = await out.copyPages(source, [pageIndex]);
  out.addPage(page!);
  isolateContent(out, page!);
  const box = page!.getCropBox();
  const view = [box.x, box.y, box.x + box.width, box.y + box.height];
  const rotation = page!.getRotation().angle;
  const toDrawing = viewportTransform(view, rotation);
  const swap = ((rotation % 180) + 180) % 180 === 90;
  const size = swap
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };
  drawOverlay(page!, fonts, overlay, invert(toDrawing), size);
  return page!;
}

/**
 * Wraps the page's own content in q … Q, so graphics state it leaves behind
 * (a scaled CTM, a clip) cannot move or hide the overlay drawn after it.
 */
function isolateContent(doc: PDFDocument, page: PDFPage): void {
  page.node.normalize();
  const wrap = (op: PDFOperator) =>
    doc.context.register(PDFContentStream.of(doc.context.obj({}), [op]));
  page.node.wrapContentStreams(wrap(pushGraphicsState()), wrap(popGraphicsState()));
}

/** CAD colours on white paper, exactly as the viewer shows them. */
function cadColour(rgb: number, mode: CadColorMode): [number, number, number] {
  return colour(displayColor(rgb, mode));
}

/** A coordinate to a thousandth of a point: far finer than print, and half the digits. */
function coordinate(v: number): string {
  const rounded = Math.round(v * 1000) / 1000;
  return rounded === 0 ? '0' : String(rounded);
}

const encoder = new TextEncoder();

/**
 * CAD page content, written straight to text. A large drawing has millions of
 * points, and a pdf-lib operator object for each would exhaust the worker's
 * memory.
 */
class CadContent {
  private readonly chunks: Uint8Array[] = [];
  private text = '';

  push(...ops: PDFOperator[]): void {
    for (const op of ops) this.write(`${op.toString()}\n`);
  }

  /** A path through flat coordinates [x0, y0, x1, y1, …]. */
  path(coords: readonly number[], close: boolean): void {
    let text = '';
    for (let i = 0; i + 1 < coords.length; i += 2) {
      text += `${coordinate(coords[i]!)} ${coordinate(coords[i + 1]!)} ${i === 0 ? 'm' : 'l'}\n`;
    }
    this.write(close ? `${text}h\n` : text);
  }

  private write(text: string): void {
    this.text += text;
    if (this.text.length >= 1 << 16) this.flush();
  }

  private flush(): void {
    // Operators, numbers, names and hex strings are all ASCII: one byte a character.
    this.chunks.push(encoder.encode(this.text));
    this.text = '';
  }

  /** Adds the content to the page as one compressed stream. */
  addTo(page: PDFPage): void {
    this.flush();
    const bytes = new Uint8Array(this.chunks.reduce((n, chunk) => n + chunk.length, 0));
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const { context } = page.doc;
    page.node.addContentStream(context.register(context.flateStream(bytes)));
  }
}

function textRunOps(ops: CadContent, fonts: Fonts, run: TextRun, mode: CadColorMode): void {
  const text = encodable(fonts.regular, run.text, fonts.cache);
  if (!text.trim()) return;
  const width = fonts.regular.widthOfTextAtSize(text, run.size);
  const dx = run.align === 'center' ? -width / 2 : run.align === 'right' ? -width : 0;
  const dy =
    run.baseline === 'middle'
      ? -0.35 * run.size
      : run.baseline === 'top'
        ? -0.75 * run.size
        : run.baseline === 'bottom'
          ? 0.2 * run.size
          : 0;
  ops.push(
    setFillingRgbColor(...cadColour(run.color, mode)),
    beginText(),
    setFontAndSize(fontKey(fonts, fonts.regular), run.size),
    // Same frame as the canvas renderer's transform(a, b, -c, -d, x, y), in PDF text space.
    setTextMatrix(run.a, run.b, run.c, run.d, run.x, run.y),
    moveText(dx, dy),
    showText(fonts.regular.encodeText(text)),
    endText(),
  );
}

/** EXP-04: a CAD drawing as vector content on a page of its layout's paper size. */
export function addCadPage(
  out: PDFDocument,
  list: DisplayList,
  fonts: Fonts,
  mode: CadColorMode,
  overlay: Overlay,
): PDFPage {
  const page = out.addPage([list.width, list.height]);
  registerFonts(page, fonts);
  const ops = new CadContent();
  ops.push(
    pushGraphicsState(),
    // Display lists are in points with y down.
    concatTransformationMatrix(1, 0, 0, -1, 0, list.height),
    setLineJoin(LineJoinStyle.Round),
    setLineCap(LineCapStyle.Round),
  );
  const alphaStates = new Map<number, PDFName>();
  for (const group of list.groups) {
    ops.push(pushGraphicsState());
    if (group.clip && group.clip.length >= 6) {
      ops.path(group.clip, true);
      ops.push(clip(), endPath());
    }
    for (const batch of group.fills) {
      let state = alphaStates.get(batch.alpha);
      if (!state) {
        state = alphaState(page, batch.alpha);
        alphaStates.set(batch.alpha, state);
      }
      ops.push(setGraphicsState(state), setFillingRgbColor(...cadColour(batch.color, mode)));
      for (const shape of batch.shapes) {
        for (const loop of shape) ops.path(loop, true);
        ops.push(PDFOperator.of(PDFOperatorNames.FillEvenOdd));
      }
    }
    for (const batch of group.strokes) {
      ops.push(
        setStrokingRgbColor(...cadColour(batch.color, mode)),
        setLineWidth(Math.max(batch.width, 0.1)),
        setDashPattern(batch.dash ?? [], 0),
      );
      for (const path of batch.paths) {
        if (path.length < 4) continue;
        ops.path(path, false);
        ops.push(stroke());
      }
    }
    ops.push(setDashPattern([], 0));
    for (const run of group.texts) textRunOps(ops, fonts, run, mode);
    ops.push(popGraphicsState());
  }
  ops.push(popGraphicsState());
  ops.addTo(page);
  drawOverlay(page, fonts, overlay, [1, 0, 0, -1, 0, list.height], {
    width: list.width,
    height: list.height,
  });
  return page;
}
