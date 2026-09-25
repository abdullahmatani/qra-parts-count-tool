/**
 * Keeps panning and zooming smooth with thousands of markers (NFR-03).
 *
 * While the whole sheet fits in a bitmap of CACHE_MAX_PIXELS, the markers are
 * drawn once into that bitmap and each frame only copies it into place: a pan
 * costs one image draw. During a zoom the bitmap is scaled, and it is redrawn
 * at the new scale once the view settles. Markers being dragged and the hover
 * halo are drawn on top every frame. Further in, where the sheet is larger than
 * the bitmap, only the markers in view are drawn.
 */
import type { Size2D } from '@/domain/schema/types';
import { geometryBounds } from '@/domain/markup/geometry';
import {
  BASE_SCALE,
  applyMatrix,
  invertMatrix,
  multiplyMatrix,
  visibleDrawingRect,
  type Matrix,
  type ViewState,
} from '@/features/viewer/view-transform';
import {
  drawHoverHalo,
  drawMarkers,
  previewGeometry,
  type DrawOptions,
  type MarkerEntry,
  type MarkerPreview,
} from './marker-canvas';

/** Longest side of the cached marker bitmap, in device pixels. */
export const CACHE_MAX_PIXELS = 3072;
/** Up to this many markers are simply drawn every frame. */
export const DIRECT_LIMIT = 300;
/** Room around the sheet for labels, in CSS pixels. */
const MARGIN = 120;

export interface RenderOptions extends DrawOptions {
  view: ViewState;
  drawingSize: Size2D;
  /** The view has not changed for a while: a scaled cache may be redrawn now. */
  settled: boolean;
}

interface Cache {
  canvas: HTMLCanvasElement;
  entries: readonly MarkerEntry[];
  excludeKey: string;
  showLabels: boolean;
  zoom: number;
  rotation: number;
  dpr: number;
  /** Drawing → cache device pixels. */
  matrix: Matrix;
}

function excludedIds(preview: MarkerPreview | null): Set<string> {
  if (preview?.kind === 'move') return new Set(preview.ids);
  if (preview?.kind === 'resize') return new Set([preview.id]);
  return new Set();
}

function device(m: Matrix, dpr: number): Matrix {
  return [m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr];
}

/** Markers whose bounds (plus room for the label) touch the visible area. */
export function cullToView(
  entries: readonly MarkerEntry[],
  view: ViewState,
  canvas: Size2D,
  unitsPerPixel: number,
): MarkerEntry[] {
  const rect = visibleDrawingRect(view, canvas);
  const pad = MARGIN * unitsPerPixel;
  const minX = rect.x - pad;
  const minY = rect.y - pad;
  const maxX = rect.x + rect.width + pad;
  const maxY = rect.y + rect.height + pad;
  return entries.filter((entry) => {
    const b = geometryBounds(entry.geometry);
    return b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY;
  });
}

export class MarkerRenderer {
  private cache: Cache | null = null;

  /**
   * Draws the markers for one frame. Returns true when a scaled cache was used,
   * so the caller should call again once the view settles.
   */
  render(
    ctx: CanvasRenderingContext2D,
    entries: readonly MarkerEntry[],
    options: RenderOptions,
  ): boolean {
    const { view, drawingSize, devicePixelRatio: dpr } = options;
    const scale = view.zoom * BASE_SCALE * dpr;
    const sheet = Math.max(drawingSize.width, drawingSize.height) * scale + 2 * MARGIN * dpr;
    if (entries.length <= DIRECT_LIMIT || sheet > CACHE_MAX_PIXELS) {
      this.cache = null;
      const inView =
        entries.length <= DIRECT_LIMIT
          ? entries
          : cullToView(entries, view, options.canvasSize, options.unitsPerPixel);
      drawMarkers(ctx, inView, options);
      return false;
    }

    const excluded = excludedIds(options.preview);
    const excludeKey = [...excluded].sort().join(',');
    const cache = this.cache;
    const sameContent =
      cache !== null &&
      cache.entries === entries &&
      cache.excludeKey === excludeKey &&
      cache.showLabels === options.showLabels &&
      cache.rotation === view.rotation &&
      cache.dpr === dpr;
    let stale = false;
    if (!sameContent || (cache.zoom !== view.zoom && options.settled)) {
      this.cache = this.build(entries, excluded, excludeKey, options);
    } else if (cache.zoom !== view.zoom) {
      stale = true;
    }
    const current = this.cache!;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const t = multiplyMatrix(device(options.matrix, dpr), invertMatrix(current.matrix));
    ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(current.canvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (excluded.size > 0) {
      drawMarkers(
        ctx,
        entries.filter((e) => excluded.has(e.id)),
        { ...options, clear: false },
      );
    }
    if (options.hoveredId && !excluded.has(options.hoveredId))
      this.drawHover(ctx, entries, options);
    return stale;
  }

  private drawHover(
    ctx: CanvasRenderingContext2D,
    entries: readonly MarkerEntry[],
    options: RenderOptions,
  ): void {
    if (!options.hoveredId) return;
    const entry = entries.find((e) => e.id === options.hoveredId);
    if (entry && !entry.selected) {
      drawHoverHalo(ctx, [entry, previewGeometry(entry, options.preview)], options);
    }
  }

  private build(
    entries: readonly MarkerEntry[],
    excluded: ReadonlySet<string>,
    excludeKey: string,
    options: RenderOptions,
  ): Cache {
    const { matrix: m, drawingSize, devicePixelRatio: dpr, view } = options;
    const corners = [
      applyMatrix(m, { x: 0, y: 0 }),
      applyMatrix(m, { x: drawingSize.width, y: 0 }),
      applyMatrix(m, { x: 0, y: drawingSize.height }),
      applyMatrix(m, { x: drawingSize.width, y: drawingSize.height }),
    ];
    const minX = Math.min(...corners.map((p) => p.x));
    const minY = Math.min(...corners.map((p) => p.y));
    const width = Math.max(...corners.map((p) => p.x)) - minX + 2 * MARGIN;
    const height = Math.max(...corners.map((p) => p.y)) - minY + 2 * MARGIN;
    // Drawing → cache CSS pixels: the view's scale and rotation, sheet at the margin.
    const cssMatrix: Matrix = [m[0], m[1], m[2], m[3], m[4] - minX + MARGIN, m[5] - minY + MARGIN];

    const canvas = this.cache?.canvas ?? document.createElement('canvas');
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawMarkers(ctx, excluded.size ? entries.filter((e) => !excluded.has(e.id)) : entries, {
        ...options,
        matrix: cssMatrix,
        canvasSize: { width, height },
        preview: null,
        hoveredId: null,
        clear: true,
      });
    }
    return {
      canvas,
      entries,
      excludeKey,
      showLabels: options.showLabels,
      zoom: view.zoom,
      rotation: view.rotation,
      dpr,
      matrix: device(cssMatrix, dpr),
    };
  }

  dispose(): void {
    if (this.cache) {
      this.cache.canvas.width = 0;
      this.cache.canvas.height = 0;
    }
    this.cache = null;
  }
}
