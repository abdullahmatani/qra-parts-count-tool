import type { Size2D } from '@/domain/schema/types';
import type { Matrix, Point2, ViewState } from './view-transform';

/** Everything an overlay or tool needs to work in drawing coordinates. */
export interface ViewerContext {
  drawingId: string;
  drawingSize: Size2D;
  canvasSize: Size2D;
  view: ViewState;
  /** Drawing → screen (CSS px within the canvas). */
  matrix: Matrix;
  toDrawing(screen: Point2): Point2;
  toScreen(drawing: Point2): Point2;
  /** Drawing units per CSS pixel at the current zoom (for hit tolerances). */
  unitsPerPixel: number;
}

export interface ViewerPointerEvent {
  /** Drawing coordinates of the pointer. */
  point: Point2;
  /** Screen coordinates within the canvas (CSS px). */
  screen: Point2;
  native: React.PointerEvent<HTMLElement>;
}

/** Tool hooks called by the viewer for pointer input it does not use for panning. */
export interface ViewerInteraction {
  cursor?: string;
  onPointerDown?(event: ViewerPointerEvent, context: ViewerContext): void;
  onPointerMove?(event: ViewerPointerEvent, context: ViewerContext): void;
  onPointerUp?(event: ViewerPointerEvent, context: ViewerContext): void;
  /** The pointer left the canvas. */
  onPointerLeave?(): void;
  onDoubleClick?(event: { point: Point2; screen: Point2 }, context: ViewerContext): void;
  onKeyDown?(event: React.KeyboardEvent<HTMLElement>, context: ViewerContext): boolean;
}
