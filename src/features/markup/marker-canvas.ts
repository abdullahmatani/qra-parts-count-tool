/**
 * Draws markers on a canvas above the drawing (ANN-01..03, ANN-05; NFR-03).
 *
 * The whole marker layer is redrawn on every view change. Markers are grouped
 * by style so a few thousand markers take a handful of stroke and fill calls;
 * labels are drawn in screen space so they stay upright and a constant size.
 */
import type { MarkerGeometry, MarkerSymbol, Point } from '@/domain/schema/types';
import {
  DOT_ALPHA,
  END_FLANGE_ALPHA,
  HIGHLIGHTER_ALPHA,
  MARKER_SELECTION,
  MARKER_WARNING,
  SETUP_DIMMED_ALPHA,
} from '@/domain/palette';
import {
  doubleLineBand,
  doubleLineStrokes,
  doubleLineTop,
  symbolPolygon,
  translateGeometry,
  type XY,
} from '@/domain/markup/geometry';
import { applyMatrix, type Matrix } from '@/features/viewer/view-transform';

/** One marker as drawn: its geometry and resolved appearance. */
export interface MarkerEntry {
  id: string;
  geometry: MarkerGeometry;
  colour: string;
  dash: readonly number[];
  label: string;
  selected: boolean;
  /** Highlighted from the count table (CNT-06). */
  highlighted: boolean;
  warning: boolean;
  esdv: boolean;
  /** An end flange: its double line geometry is drawn as a solid bar across the pipe. */
  endFlange: boolean;
  /** How a circle is drawn: a ring, a filled dot, a square or a free-form outline. */
  symbol: MarkerSymbol;
  /** A free-form symbol's outline, relative to the circle (see MarkerStyle). */
  outline: readonly Point[] | null;
  segmentId: string | null;
  /** Segment set-up while counting: drawn faint, under the equipment. */
  dimmed: boolean;
}

/** A marker and the geometry it is drawn with this frame (moved or resized while dragged). */
export type Drawn = readonly [MarkerEntry, MarkerGeometry];

/**
 * A marker drawn somewhere else while it is being dragged or resized, or
 * drawn as what is left of it while the eraser goes over it (none of it once
 * it is rubbed out).
 */
export type MarkerPreview =
  | { kind: 'move'; ids: ReadonlySet<string>; dx: number; dy: number }
  | { kind: 'resize'; id: string; geometry: MarkerGeometry }
  | { kind: 'erase'; left: ReadonlyMap<string, readonly MarkerGeometry[]> };

export interface DrawOptions {
  /** Drawing → CSS px within the canvas. */
  matrix: Matrix;
  devicePixelRatio: number;
  /** Drawing units per CSS pixel. */
  unitsPerPixel: number;
  canvasSize: { width: number; height: number };
  preview: MarkerPreview | null;
  /** Marker under the pointer, drawn with a light halo. */
  hoveredId: string | null;
  showLabels: boolean;
  /** Clear the canvas first (default true). */
  clear?: boolean;
}

export const LABEL_FONT = '600 11px "Inter Variable", Inter, system-ui, sans-serif';

export function previewGeometry(entry: MarkerEntry, preview: MarkerPreview | null): MarkerGeometry {
  if (preview?.kind === 'move' && preview.ids.has(entry.id)) {
    return translateGeometry(entry.geometry, preview.dx, preview.dy);
  }
  if (preview?.kind === 'resize' && preview.id === entry.id) return preview.geometry;
  return entry.geometry;
}

function tracePath(ctx: CanvasRenderingContext2D, [entry, g]: Drawn): void {
  switch (g.type) {
    case 'circle': {
      const polygon = symbolPolygon(g, entry);
      if (polygon) {
        polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
      } else {
        ctx.moveTo(g.cx + g.r, g.cy);
        ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
      }
      break;
    }
    case 'rect':
      ctx.rect(g.x, g.y, g.width, g.height);
      break;
    case 'polyline':
    case 'stroke': {
      const [first, ...rest] = g.points;
      if (!first) return;
      ctx.moveTo(first[0], first[1]);
      for (const [x, y] of rest) ctx.lineTo(x, y);
      break;
    }
    case 'doubleLine':
      if (entry.endFlange) {
        doubleLineBand(g).forEach((p, i) =>
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
        );
        ctx.closePath();
        break;
      }
      for (const [a, b] of doubleLineStrokes(g)) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      break;
  }
}

/** Where a marker's label goes, and how it is aligned (screen offsets in px). */
function labelAnchor(g: MarkerGeometry): { point: XY; dx: number; dy: number; above: boolean } {
  switch (g.type) {
    case 'circle':
      return { point: { x: g.cx + g.r, y: g.cy }, dx: 4, dy: 0, above: false };
    case 'rect':
      return { point: { x: g.x, y: g.y }, dx: 0, dy: -3, above: true };
    case 'polyline':
    case 'stroke': {
      const [x, y] = g.points[0] ?? [0, 0];
      return { point: { x, y }, dx: 4, dy: -4, above: true };
    }
    case 'doubleLine':
      return { point: doubleLineTop(g), dx: 4, dy: -4, above: true };
  }
}

interface Group {
  colour: string;
  dash: readonly number[];
  width: number;
  shapes: Drawn[];
}

function groupBy(entries: Iterable<Drawn>, width: (e: MarkerEntry) => number) {
  const groups = new Map<string, Group>();
  for (const drawn of entries) {
    const [entry] = drawn;
    const w = width(entry);
    const key = `${entry.colour}|${entry.dash.join(',')}|${w}`;
    let group = groups.get(key);
    if (!group) {
      group = { colour: entry.colour, dash: entry.dash, width: w, shapes: [] };
      groups.set(key, group);
    }
    group.shapes.push(drawn);
  }
  return groups.values();
}

/** Fills `shapes` at `alpha` of the current opacity, which is then restored. */
function fillAll(
  ctx: CanvasRenderingContext2D,
  shapes: readonly Drawn[],
  style: string,
  alpha: number,
): void {
  if (shapes.length === 0) return;
  ctx.beginPath();
  for (const shape of shapes) tracePath(ctx, shape);
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * alpha;
  ctx.fillStyle = style;
  ctx.fill();
  ctx.globalAlpha = base;
}

/**
 * Strokes the outlines of `shapes`. A highlighter stroke is as wide as its pen
 * plus `width`, with round ends, so halos show around it rather than inside.
 */
function strokeAll(
  ctx: CanvasRenderingContext2D,
  shapes: readonly Drawn[],
  style: string,
  width: number,
  dash: readonly number[] = [],
): void {
  if (shapes.length === 0) return;
  const outlines = shapes.filter(([, g]) => g.type !== 'stroke');
  if (outlines.length) {
    ctx.beginPath();
    for (const shape of outlines) tracePath(ctx, shape);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.setLineDash(dash as number[]);
    ctx.stroke();
  }
  const pens = new Map<number, Drawn[]>();
  for (const shape of shapes) {
    const g = shape[1];
    if (g.type === 'stroke') pens.set(g.width, [...(pens.get(g.width) ?? []), shape]);
  }
  if (pens.size === 0) return;
  const cap = ctx.lineCap;
  ctx.lineCap = 'round';
  ctx.strokeStyle = style;
  ctx.setLineDash([]);
  // One path per pen, so where strokes of a segment overlap they do not darken.
  for (const [pen, list] of pens) {
    ctx.beginPath();
    for (const shape of list) tracePath(ctx, shape);
    ctx.lineWidth = pen + width;
    ctx.stroke();
  }
  ctx.lineCap = cap;
}

/** Draws all markers. `entries` are in paint order (highlights first). */
export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  entries: readonly MarkerEntry[],
  options: DrawOptions,
): void {
  const { matrix: m, devicePixelRatio: dpr } = options;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (options.clear !== false) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (entries.length === 0) return;
  ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  const { preview } = options;
  // A stroke the eraser cut is drawn as its pieces.
  const drawn =
    preview?.kind === 'erase'
      ? entries.flatMap((entry) =>
          (preview.left.get(entry.id) ?? [entry.geometry]).map((g): Drawn => [entry, g]),
        )
      : entries.map((entry): Drawn => [entry, previewGeometry(entry, preview)]);
  // While counting, the segments' set-up goes first and faint, so the
  // equipment is drawn over it at full strength.
  const faint = drawn.filter(([e]) => e.dimmed);
  if (faint.length) paintMarkers(ctx, faint, options, SETUP_DIMMED_ALPHA);
  paintMarkers(ctx, faint.length ? drawn.filter(([e]) => !e.dimmed) : drawn, options, 1);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  if (options.showLabels) drawLabels(ctx, drawn, options);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Paints markers in the current transform, every opacity scaled by `fade`. */
function paintMarkers(
  ctx: CanvasRenderingContext2D,
  drawn: readonly Drawn[],
  options: DrawOptions,
  fade: number,
): void {
  const upp = options.unitsPerPixel;
  const circles = drawn.filter(([, g]) => g.type === 'circle');
  const rects = drawn.filter(([, g]) => g.type === 'rect');
  const runs = drawn.filter(([, g]) => g.type === 'polyline');
  const strokes = drawn.filter(([, g]) => g.type === 'stroke');
  const doubleLines = drawn.filter(([e, g]) => g.type === 'doubleLine' && !e.endFlange);
  const endFlanges = drawn.filter(([e, g]) => g.type === 'doubleLine' && e.endFlange);

  // Halos behind the markers: count-table highlight, selection, hover and
  // warnings (amber outline).
  ctx.globalAlpha = 0.35 * fade;
  strokeAll(
    ctx,
    drawn.filter(([e]) => e.highlighted),
    MARKER_SELECTION,
    16 * upp,
  );
  ctx.globalAlpha = 0.45 * fade;
  strokeAll(
    ctx,
    drawn.filter(([e]) => e.selected),
    MARKER_SELECTION,
    8 * upp,
  );
  ctx.globalAlpha = 0.25 * fade;
  strokeAll(
    ctx,
    drawn.filter(([e]) => e.id === options.hoveredId && !e.selected),
    MARKER_SELECTION,
    6 * upp,
  );
  ctx.globalAlpha = fade;
  strokeAll(
    ctx,
    drawn.filter(([e]) => e.warning),
    MARKER_WARNING,
    5.5 * upp,
  );

  // Highlighter strokes at the bottom: translucent paint over the linework.
  ctx.globalAlpha = HIGHLIGHTER_ALPHA * fade;
  for (const group of groupBy(strokes, () => 0)) strokeAll(ctx, group.shapes, group.colour, 0);
  ctx.globalAlpha = fade;

  // Dashed highlights: areas and line runs (ANN-01).
  const areaDash = [9 * upp, 5 * upp];
  for (const group of groupBy(rects, () => 2.5)) {
    fillAll(ctx, group.shapes, group.colour, 0.05);
    strokeAll(ctx, group.shapes, group.colour, 2.5 * upp, areaDash);
  }
  ctx.lineCap = 'round';
  for (const group of groupBy(runs, () => 2.5)) {
    ctx.globalAlpha = 0.18 * fade;
    strokeAll(ctx, group.shapes, group.colour, 10 * upp);
    ctx.globalAlpha = fade;
    strokeAll(ctx, group.shapes, group.colour, 2.5 * upp, areaDash);
  }
  ctx.lineCap = 'butt';

  // Circles on top, so items inside a highlighted area stay visible (ANN-03).
  // Rings, squares and outlines get a faint wash; dots are filled.
  for (const group of groupBy(circles, (e) => (e.esdv ? 3 : e.symbol === 'dot' ? 1 : 2))) {
    fillAll(
      ctx,
      group.shapes.filter(([e]) => e.symbol !== 'dot'),
      group.colour,
      0.08,
    );
    fillAll(
      ctx,
      group.shapes.filter(([e]) => e.symbol === 'dot'),
      group.colour,
      DOT_ALPHA,
    );
    strokeAll(
      ctx,
      group.shapes,
      group.colour,
      group.width * upp,
      group.dash.map((d) => d * upp),
    );
  }
  // ESDV double lines across the pipe, a little lighter than a ring so the
  // gap between them shows (SEG-01).
  for (const group of groupBy(doubleLines, () => 2.5)) {
    strokeAll(ctx, group.shapes, group.colour, group.width * upp);
  }
  // End flanges: a solid bar across the pipe where the segment ends.
  for (const group of groupBy(endFlanges, () => 1.5)) {
    fillAll(ctx, group.shapes, group.colour, END_FLANGE_ALPHA);
    strokeAll(ctx, group.shapes, group.colour, group.width * upp);
  }
  ctx.setLineDash([]);
}

/** A light halo around the marker under the pointer, drawn over everything else. */
export function drawHoverHalo(
  ctx: CanvasRenderingContext2D,
  shape: Drawn,
  { matrix: m, devicePixelRatio: dpr, unitsPerPixel: upp }: DrawOptions,
): void {
  ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
  ctx.globalAlpha = 0.3;
  ctx.lineJoin = 'round';
  strokeAll(ctx, [shape], MARKER_SELECTION, 6 * upp);
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Approximate advance of one label character at LABEL_FONT, in CSS px. */
const LABEL_CHAR_WIDTH = 6.4;
const LABEL_HEIGHT = 13;
const GRID = 64;

/**
 * Screen-space collision grid for labels. When markers crowd together at low
 * zoom, a label that would overlap one already placed is skipped, so the
 * labels that are shown stay readable; zooming in reveals the rest.
 */
export class LabelGrid {
  private readonly cells = new Map<number, [number, number, number, number][]>();

  /** Places the box if it overlaps nothing placed so far. */
  place(x0: number, y0: number, x1: number, y1: number): boolean {
    const cx0 = Math.floor(x0 / GRID);
    const cx1 = Math.floor(x1 / GRID);
    const cy0 = Math.floor(y0 / GRID);
    const cy1 = Math.floor(y1 / GRID);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        for (const [a0, b0, a1, b1] of this.cells.get(cx * 100_003 + cy) ?? []) {
          if (x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0) return false;
        }
      }
    }
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const key = cx * 100_003 + cy;
        const list = this.cells.get(key);
        if (list) list.push([x0, y0, x1, y1]);
        else this.cells.set(key, [[x0, y0, x1, y1]]);
      }
    }
    return true;
  }
}

/** ANN-05: labels in screen space; off-screen and overlapping labels are skipped. */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  drawn: readonly (readonly [MarkerEntry, MarkerGeometry])[],
  { matrix, devicePixelRatio: dpr, canvasSize }: DrawOptions,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = LABEL_FONT;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  const margin = 150;
  const grid = new LabelGrid();
  // Selected markers claim their label space first, faint set-up last.
  const rank = (e: MarkerEntry) => (e.selected ? 0 : e.dimmed ? 2 : 1);
  const ordered = [...drawn].sort(([a], [b]) => rank(a) - rank(b));
  for (const [entry, geometry] of ordered) {
    if (!entry.label) continue;
    const anchor = labelAnchor(geometry);
    const p = applyMatrix(matrix, anchor.point);
    const x = p.x + anchor.dx;
    const y = p.y + anchor.dy;
    if (
      x < -margin ||
      y < -margin ||
      x > canvasSize.width + margin ||
      y > canvasSize.height + margin
    ) {
      continue;
    }
    const top = anchor.above ? y - LABEL_HEIGHT : y - LABEL_HEIGHT / 2;
    const width = entry.label.length * LABEL_CHAR_WIDTH;
    if (!grid.place(x - 1, top, x + width + 1, top + LABEL_HEIGHT)) continue;
    ctx.textBaseline = anchor.above ? 'bottom' : 'middle';
    ctx.globalAlpha = entry.dimmed ? SETUP_DIMMED_ALPHA : 1;
    ctx.strokeText(entry.label, x, y);
    ctx.fillStyle = entry.colour;
    ctx.fillText(entry.label, x, y);
  }
  ctx.globalAlpha = 1;
}
