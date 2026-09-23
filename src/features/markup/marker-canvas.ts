/**
 * Draws markers on a canvas above the drawing (ANN-01..03, ANN-05; NFR-03).
 *
 * The whole marker layer is redrawn on every view change. Markers are grouped
 * by style so a few thousand markers take a handful of stroke and fill calls;
 * labels are drawn in screen space so they stay upright and a constant size.
 */
import type { MarkerGeometry } from '@/domain/schema/types';
import { MARKER_SELECTION, MARKER_WARNING } from '@/domain/palette';
import { translateGeometry, type XY } from '@/domain/markup/geometry';
import { applyMatrix, type Matrix } from '@/features/viewer/view-transform';

/** One marker as drawn: its geometry and resolved appearance. */
export interface MarkerEntry {
  id: string;
  geometry: MarkerGeometry;
  colour: string;
  dash: readonly number[];
  label: string;
  selected: boolean;
  warning: boolean;
  esdv: boolean;
  segmentId: string | null;
}

/** A marker drawn somewhere else while it is being dragged or resized. */
export type MarkerPreview =
  | { kind: 'move'; ids: ReadonlySet<string>; dx: number; dy: number }
  | { kind: 'resize'; id: string; geometry: MarkerGeometry };

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

function tracePath(ctx: CanvasRenderingContext2D, g: MarkerGeometry): void {
  switch (g.type) {
    case 'circle':
      ctx.moveTo(g.cx + g.r, g.cy);
      ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
      break;
    case 'rect':
      ctx.rect(g.x, g.y, g.width, g.height);
      break;
    case 'polyline': {
      const [first, ...rest] = g.points;
      if (!first) return;
      ctx.moveTo(first[0], first[1]);
      for (const [x, y] of rest) ctx.lineTo(x, y);
      break;
    }
  }
}

/** Where a marker's label goes, and how it is aligned (screen offsets in px). */
function labelAnchor(g: MarkerGeometry): { point: XY; dx: number; dy: number; above: boolean } {
  switch (g.type) {
    case 'circle':
      return { point: { x: g.cx + g.r, y: g.cy }, dx: 4, dy: 0, above: false };
    case 'rect':
      return { point: { x: g.x, y: g.y }, dx: 0, dy: -3, above: true };
    case 'polyline': {
      const [x, y] = g.points[0] ?? [0, 0];
      return { point: { x, y }, dx: 4, dy: -4, above: true };
    }
  }
}

interface Group {
  colour: string;
  dash: readonly number[];
  width: number;
  geometries: MarkerGeometry[];
}

function groupBy(
  entries: Iterable<readonly [MarkerEntry, MarkerGeometry]>,
  width: (e: MarkerEntry) => number,
) {
  const groups = new Map<string, Group>();
  for (const [entry, geometry] of entries) {
    const w = width(entry);
    const key = `${entry.colour}|${entry.dash.join(',')}|${w}`;
    let group = groups.get(key);
    if (!group) {
      group = { colour: entry.colour, dash: entry.dash, width: w, geometries: [] };
      groups.set(key, group);
    }
    group.geometries.push(geometry);
  }
  return groups.values();
}

function strokeAll(
  ctx: CanvasRenderingContext2D,
  geometries: readonly MarkerGeometry[],
  style: string,
  width: number,
  dash: readonly number[] = [],
): void {
  if (geometries.length === 0) return;
  ctx.beginPath();
  for (const g of geometries) tracePath(ctx, g);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.setLineDash(dash as number[]);
  ctx.stroke();
}

/** Draws all markers. `entries` are in paint order (highlights first). */
export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  entries: readonly MarkerEntry[],
  options: DrawOptions,
): void {
  const { matrix: m, devicePixelRatio: dpr, unitsPerPixel: upp } = options;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (options.clear !== false) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (entries.length === 0) return;
  ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  const drawn = entries.map((entry) => [entry, previewGeometry(entry, options.preview)] as const);
  const circles = drawn.filter(([, g]) => g.type === 'circle');
  const rects = drawn.filter(([, g]) => g.type === 'rect');
  const runs = drawn.filter(([, g]) => g.type === 'polyline');

  // Halos behind the markers: selection, hover and warnings (amber outline).
  ctx.globalAlpha = 0.45;
  strokeAll(
    ctx,
    drawn.filter(([e]) => e.selected).map(([, g]) => g),
    MARKER_SELECTION,
    8 * upp,
  );
  ctx.globalAlpha = 0.25;
  strokeAll(
    ctx,
    drawn.filter(([e]) => e.id === options.hoveredId && !e.selected).map(([, g]) => g),
    MARKER_SELECTION,
    6 * upp,
  );
  ctx.globalAlpha = 1;
  strokeAll(
    ctx,
    drawn.filter(([e]) => e.warning).map(([, g]) => g),
    MARKER_WARNING,
    5.5 * upp,
  );

  // Dashed highlights: areas and line runs (ANN-01).
  const areaDash = [9 * upp, 5 * upp];
  for (const group of groupBy(rects, () => 2.5)) {
    ctx.beginPath();
    for (const g of group.geometries) tracePath(ctx, g);
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = group.colour;
    ctx.fill();
    ctx.globalAlpha = 1;
    strokeAll(ctx, group.geometries, group.colour, 2.5 * upp, areaDash);
  }
  ctx.lineCap = 'round';
  for (const group of groupBy(runs, () => 2.5)) {
    ctx.globalAlpha = 0.18;
    strokeAll(ctx, group.geometries, group.colour, 10 * upp);
    ctx.globalAlpha = 1;
    strokeAll(ctx, group.geometries, group.colour, 2.5 * upp, areaDash);
  }
  ctx.lineCap = 'butt';

  // Circles on top, so items inside a highlighted area stay visible (ANN-03).
  for (const group of groupBy(circles, (e) => (e.esdv ? 3 : 2))) {
    ctx.beginPath();
    for (const g of group.geometries) tracePath(ctx, g);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = group.colour;
    ctx.fill();
    ctx.globalAlpha = 1;
    strokeAll(
      ctx,
      group.geometries,
      group.colour,
      group.width * upp,
      group.dash.map((d) => d * upp),
    );
  }
  ctx.setLineDash([]);

  if (options.showLabels) drawLabels(ctx, drawn, options);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** A light halo around the marker under the pointer, drawn over everything else. */
export function drawHoverHalo(
  ctx: CanvasRenderingContext2D,
  geometry: MarkerGeometry,
  { matrix: m, devicePixelRatio: dpr, unitsPerPixel: upp }: DrawOptions,
): void {
  ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
  ctx.globalAlpha = 0.3;
  ctx.lineJoin = 'round';
  strokeAll(ctx, [geometry], MARKER_SELECTION, 6 * upp);
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
  // Selected markers claim their label space first.
  const ordered = [...drawn].sort(([a], [b]) => Number(b.selected) - Number(a.selected));
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
    ctx.strokeText(entry.label, x, y);
    ctx.fillStyle = entry.colour;
    ctx.fillText(entry.label, x, y);
  }
}
