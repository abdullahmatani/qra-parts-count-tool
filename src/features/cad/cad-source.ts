/**
 * Renders a CAD display list (DWG, DXF) as a drawing source for the viewer
 * (DRW-02). Geometry is kept as Path2D objects in drawing coordinates, so each
 * render is a handful of GPU-accelerated stroke/fill calls under the view
 * transform, at any zoom.
 */
import type { Size2D } from '@/domain/schema/types';
import type { DrawingSource, RenderRequest, RenderTask } from '@/features/viewer/drawing-source';
import { BASE_SCALE, viewMatrix, visibleDrawingRect } from '@/features/viewer/view-transform';
import { rgbToCss } from './aci';
import type { DisplayGroup, DisplayList, TextRun } from './display-list';

import type { CadColorMode } from '@/store/preferences';

export type { CadColorMode };

/** Smallest text (in device pixels of cap height) worth drawing. */
const MIN_TEXT_PX = 1.5;
/** Minimum stroke width on screen, in device pixels. */
const MIN_STROKE_PX = 0.75;
const TEXT_FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

interface PreparedGroup {
  clip: Path2D | null;
  fills: { color: string; alpha: number; path: Path2D }[];
  strokes: { color: string; width: number; dash: number[] | null; path: Path2D }[];
  texts: TextRun[];
}

function lightness(rgb: number): number {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function displayColor(rgb: number, mode: CadColorMode): string {
  if (mode === 'monochrome') return rgb === 0xffffff ? '#ffffff' : '#000000';
  // Very light CAD colours (drawn for a black background) are darkened for white paper.
  if (lightness(rgb) > 0.8 && rgb !== 0xffffff) return '#5b5b5b';
  return rgbToCss(rgb);
}

function pathFrom(paths: number[][], close = false): Path2D {
  const path = new Path2D();
  for (const coords of paths) {
    if (coords.length < 4) continue;
    path.moveTo(coords[0]!, coords[1]!);
    for (let i = 2; i < coords.length; i += 2) path.lineTo(coords[i]!, coords[i + 1]!);
    if (close) path.closePath();
  }
  return path;
}

function prepare(group: DisplayGroup, mode: CadColorMode): PreparedGroup {
  return {
    clip: group.clip ? pathFrom([group.clip], true) : null,
    fills: group.fills.map((fill) => ({
      color: fill.color === 0xffffff ? '#ffffff' : displayColor(fill.color, mode),
      alpha: fill.alpha,
      path: fill.shapes.reduce((path, loops) => {
        path.addPath(pathFrom(loops, true));
        return path;
      }, new Path2D()),
    })),
    strokes: group.strokes.map((batch) => ({
      color: displayColor(batch.color, mode),
      width: batch.width,
      dash: batch.dash,
      path: pathFrom(batch.paths),
    })),
    texts: group.texts,
  };
}

export class CadDrawingSource implements DrawingSource {
  readonly size: Size2D;
  private readonly list: DisplayList;
  private readonly mode: CadColorMode;
  private prepared: PreparedGroup[] | null = null;

  constructor(list: DisplayList, mode: CadColorMode = 'monochrome') {
    this.list = list;
    this.mode = mode;
    this.size = { width: list.width, height: list.height };
  }

  private groups(): PreparedGroup[] {
    this.prepared ??= this.list.groups.map((group) => prepare(group, this.mode));
    return this.prepared;
  }

  /**
   * Draws the display list. `k` is device pixels per drawing unit; `visible`
   * limits text drawing to the visible area.
   */
  private draw(
    ctx: CanvasRenderingContext2D,
    k: number,
    visible: { x: number; y: number; width: number; height: number } | null,
  ): void {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const group of this.groups()) {
      ctx.save();
      if (group.clip) ctx.clip(group.clip);
      for (const fill of group.fills) {
        ctx.globalAlpha = fill.alpha;
        ctx.fillStyle = fill.color;
        ctx.fill(fill.path, 'evenodd');
      }
      ctx.globalAlpha = 1;
      for (const stroke of group.strokes) {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(stroke.width, MIN_STROKE_PX / k);
        ctx.setLineDash(stroke.dash ? stroke.dash.map((d) => Math.max(d, 1 / k)) : []);
        ctx.stroke(stroke.path);
      }
      ctx.setLineDash([]);
      this.drawTexts(ctx, group.texts, k, visible);
      ctx.restore();
    }
  }

  private drawTexts(
    ctx: CanvasRenderingContext2D,
    texts: readonly TextRun[],
    k: number,
    visible: { x: number; y: number; width: number; height: number } | null,
  ): void {
    const base = ctx.getTransform();
    let font = '';
    for (const run of texts) {
      const unit = Math.hypot(run.c, run.d);
      const capPx = run.size * 0.72 * unit * k;
      if (capPx < MIN_TEXT_PX) continue;
      if (visible) {
        const reach = run.size * unit * Math.max(run.text.length, 1);
        if (
          run.x + reach < visible.x ||
          run.x - reach > visible.x + visible.width ||
          run.y + reach < visible.y ||
          run.y - reach > visible.y + visible.height
        ) {
          continue;
        }
      }
      ctx.setTransform(base);
      ctx.transform(run.a, run.b, -run.c, -run.d, run.x, run.y);
      const nextFont = `${run.size}px ${TEXT_FONT}`;
      if (nextFont !== font) {
        ctx.font = nextFont;
        font = nextFont;
      }
      ctx.fillStyle = displayColor(run.color, this.mode);
      ctx.textAlign = run.align;
      ctx.textBaseline = run.baseline;
      ctx.fillText(run.text, 0, 0);
    }
    ctx.setTransform(base);
  }

  async renderPreview(maxDimension: number): Promise<HTMLCanvasElement> {
    const scale = maxDimension / Math.max(this.size.width, this.size.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(this.size.width * scale));
    canvas.height = Math.max(1, Math.round(this.size.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.draw(ctx, scale, null);
    return canvas;
  }

  render({ canvas, view, canvasSize, devicePixelRatio: dpr }: RenderRequest): RenderTask {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { promise: Promise.resolve(), cancel: () => {} };
    const m = viewMatrix(view, canvasSize);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.size.width, this.size.height);
    this.draw(ctx, view.zoom * BASE_SCALE * dpr, visibleDrawingRect(view, canvasSize));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { promise: Promise.resolve(), cancel: () => {} };
  }

  dispose(): void {
    this.prepared = null;
  }
}
