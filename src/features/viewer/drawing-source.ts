import type { Size2D } from '@/domain/schema/types';
import type { ViewState } from './view-transform';

export interface RenderRequest {
  /** Target canvas, already sized in device pixels. */
  canvas: HTMLCanvasElement;
  view: ViewState;
  /** Canvas size in CSS pixels. */
  canvasSize: Size2D;
  devicePixelRatio: number;
}

export interface RenderTask {
  promise: Promise<void>;
  cancel(): void;
}

/**
 * A renderable drawing: a PDF page today, a DWG/DXF layout later (DRW-02).
 * Sources render in drawing coordinates, so markers line up with any source.
 */
export interface DrawingSource {
  /** Drawing size in drawing units (points) at 0° view rotation. */
  readonly size: Size2D;
  /** Low-resolution image of the whole drawing, for instant pan/zoom and the minimap. */
  renderPreview(maxDimension: number): Promise<HTMLCanvasElement>;
  /** Renders the visible part of the drawing at full resolution for the view. */
  render(request: RenderRequest): RenderTask;
  dispose(): void;
}

export function isRenderCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'RenderingCancelledException'
  );
}
