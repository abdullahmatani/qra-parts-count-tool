/**
 * View maths for the drawing canvas (DRW-05, ANN-02).
 *
 * Drawing coordinates: origin at the top-left of the drawing as normally shown,
 * x right, y down, in drawing units (PDF points). Screen coordinates: CSS pixels
 * inside the canvas element. A view is the drawing point shown at the centre of
 * the canvas, a zoom factor and a view rotation.
 *
 *   screen = C + k · R(θ) · (p − c)
 *
 * with C the canvas centre, c the view centre, k = zoom × BASE_SCALE, and R(θ)
 * a clockwise rotation by the view rotation θ.
 */
import type { Size2D } from '@/domain/schema/types';

/** 100 % zoom shows a drawing at true size on a 96 dpi screen (1 pt = 1/72 in). */
export const BASE_SCALE = 96 / 72;
/** DRW-05: zoom up to 3200 %. */
export const MAX_ZOOM = 32;
export const MIN_ZOOM = 0.01;

export type Rotation = 0 | 90 | 180 | 270;

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
  rotation: Rotation;
}

export interface Point2 {
  x: number;
  y: number;
}

/** 2D affine matrix in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function normalizeRotation(degrees: number): Rotation {
  const r = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

function rotationMatrix(rotation: Rotation): [number, number, number, number] {
  switch (rotation) {
    case 90:
      return [0, 1, -1, 0];
    case 180:
      return [-1, 0, 0, -1];
    case 270:
      return [0, -1, 1, 0];
    default:
      return [1, 0, 0, 1];
  }
}

/** Drawing → screen (CSS px) matrix for a view on a canvas of the given size. */
export function viewMatrix(view: ViewState, canvas: Size2D): Matrix {
  const k = view.zoom * BASE_SCALE;
  const [ra, rb, rc, rd] = rotationMatrix(view.rotation);
  const a = k * ra;
  const b = k * rb;
  const c = k * rc;
  const d = k * rd;
  const e = canvas.width / 2 - (a * view.x + c * view.y);
  const f = canvas.height / 2 - (b * view.x + d * view.y);
  return [a, b, c, d, e, f];
}

export function applyMatrix(m: Matrix, p: Point2): Point2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function invertMatrix(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0) throw new Error('Matrix is not invertible');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function multiplyMatrix(m: Matrix, n: Matrix): Matrix {
  // Returns m · n (apply n first, then m).
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function screenToDrawing(view: ViewState, canvas: Size2D, p: Point2): Point2 {
  return applyMatrix(invertMatrix(viewMatrix(view, canvas)), p);
}

export function drawingToScreen(view: ViewState, canvas: Size2D, p: Point2): Point2 {
  return applyMatrix(viewMatrix(view, canvas), p);
}

/** Size of the drawing on screen at zoom 1 once rotated. */
function rotatedSize(drawing: Size2D, rotation: Rotation): Size2D {
  return rotation === 90 || rotation === 270
    ? { width: drawing.height, height: drawing.width }
    : drawing;
}

/** Fits the whole drawing (or its width) into the canvas with a margin in CSS px. */
export function fitView(
  drawing: Size2D,
  canvas: Size2D,
  rotation: Rotation = 0,
  mode: 'page' | 'width' = 'page',
  margin = 24,
): ViewState {
  const size = rotatedSize(drawing, rotation);
  const availW = Math.max(1, canvas.width - 2 * margin);
  const availH = Math.max(1, canvas.height - 2 * margin);
  const zx = availW / (size.width * BASE_SCALE);
  const zy = availH / (size.height * BASE_SCALE);
  const zoom = clampZoom(mode === 'width' ? zx : Math.min(zx, zy));
  if (mode === 'width') {
    // Show the top of the drawing (as rotated) when fitting the width.
    const halfVisible = canvas.height / 2 / (zoom * BASE_SCALE);
    const top = screenTopCentre(drawing, rotation, halfVisible);
    return { ...top, zoom, rotation };
  }
  return { x: drawing.width / 2, y: drawing.height / 2, zoom, rotation };
}

function screenTopCentre(drawing: Size2D, rotation: Rotation, halfVisible: number): Point2 {
  const cx = drawing.width / 2;
  const cy = drawing.height / 2;
  const size = rotatedSize(drawing, rotation);
  const offset = Math.max(0, size.height / 2 - halfVisible);
  // Move the view centre towards the drawing edge that is at the top of the screen.
  switch (rotation) {
    case 90:
      return { x: cx - offset, y: cy };
    case 180:
      return { x: cx, y: cy + offset };
    case 270:
      return { x: cx + offset, y: cy };
    default:
      return { x: cx, y: cy - offset };
  }
}

/** Zooms by `factor`, keeping the drawing point under `anchor` (screen px) still. */
export function zoomAt(view: ViewState, canvas: Size2D, anchor: Point2, factor: number): ViewState {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === view.zoom) return view;
  const before = screenToDrawing(view, canvas, anchor);
  const next = { ...view, zoom };
  const after = screenToDrawing(next, canvas, anchor);
  return { ...next, x: next.x + (before.x - after.x), y: next.y + (before.y - after.y) };
}

/** Sets an absolute zoom around the canvas centre. */
export function setZoom(view: ViewState, zoom: number): ViewState {
  return { ...view, zoom: clampZoom(zoom) };
}

/** Pans by a screen-space delta in CSS px. */
export function panBy(view: ViewState, dx: number, dy: number): ViewState {
  const k = view.zoom * BASE_SCALE;
  const [ra, rb, rc, rd] = rotationMatrix(view.rotation);
  // Inverse rotation of the screen delta (R is orthonormal, so R⁻¹ = Rᵀ).
  const ddx = (ra * dx + rb * dy) / k;
  const ddy = (rc * dx + rd * dy) / k;
  return { ...view, x: view.x - ddx, y: view.y - ddy };
}

/** Rotates the view by ±90° around the current view centre. */
export function rotateBy(view: ViewState, delta: 90 | -90): ViewState {
  return { ...view, rotation: normalizeRotation(view.rotation + delta) };
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Axis-aligned bounds, in drawing coordinates, of the area visible in the canvas. */
export function visibleDrawingRect(view: ViewState, canvas: Size2D): RectLike {
  const inv = invertMatrix(viewMatrix(view, canvas));
  const corners = [
    applyMatrix(inv, { x: 0, y: 0 }),
    applyMatrix(inv, { x: canvas.width, y: 0 }),
    applyMatrix(inv, { x: 0, y: canvas.height }),
    applyMatrix(inv, { x: canvas.width, y: canvas.height }),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Centres the view on a drawing rectangle, zooming so it fits (SEG-05). */
export function viewForRect(
  rect: RectLike,
  canvas: Size2D,
  rotation: Rotation,
  margin = 48,
  maxZoom = 4,
): ViewState {
  const size = rotatedSize(
    { width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) },
    rotation,
  );
  const zx = Math.max(1, canvas.width - 2 * margin) / (size.width * BASE_SCALE);
  const zy = Math.max(1, canvas.height - 2 * margin) / (size.height * BASE_SCALE);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    zoom: clampZoom(Math.min(zx, zy, maxZoom)),
    rotation,
  };
}

export function matrixToCss(m: Matrix): string {
  return `matrix(${m.map((v) => (Number.isFinite(v) ? +v.toFixed(6) : 0)).join(',')})`;
}
