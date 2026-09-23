import { describe, expect, it } from 'vitest';
import {
  BASE_SCALE,
  MAX_ZOOM,
  applyMatrix,
  clampZoom,
  drawingToScreen,
  fitView,
  invertMatrix,
  multiplyMatrix,
  normalizeRotation,
  panBy,
  rotateBy,
  screenToDrawing,
  viewForRect,
  viewMatrix,
  visibleDrawingRect,
  zoomAt,
  type ViewState,
} from './view-transform';

const canvas = { width: 1000, height: 600 };
const a1 = { width: 2384, height: 1684 };
const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

describe('view transform (DRW-05, ANN-02)', () => {
  it('maps the view centre to the canvas centre at any zoom and rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const zoom of [0.1, 1, 32]) {
        const view: ViewState = { x: 500, y: 300, zoom, rotation };
        close(drawingToScreen(view, canvas, { x: 500, y: 300 }), { x: 500, y: 300 });
      }
    }
  });

  it('shows 1 pt as 96/72 CSS px at 100 %', () => {
    const view: ViewState = { x: 0, y: 0, zoom: 1, rotation: 0 };
    const p = drawingToScreen(view, canvas, { x: 72, y: 0 });
    expect(p.x - canvas.width / 2).toBeCloseTo(96);
    expect(BASE_SCALE).toBeCloseTo(1.3333, 3);
  });

  it('rotates clockwise: drawing right becomes screen down at 90°', () => {
    const view: ViewState = { x: 0, y: 0, zoom: 1, rotation: 90 };
    const p = drawingToScreen(view, canvas, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeGreaterThan(300);
  });

  it('round-trips screen and drawing coordinates', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const view: ViewState = { x: 812, y: 377, zoom: 3.7, rotation };
      const p = { x: 123.4, y: 567.8 };
      close(screenToDrawing(view, canvas, drawingToScreen(view, canvas, p)), p);
    }
  });

  it('inverts and multiplies matrices', () => {
    const m = viewMatrix({ x: 5, y: 7, zoom: 2, rotation: 270 }, canvas);
    const id = multiplyMatrix(m, invertMatrix(m));
    close(applyMatrix(id, { x: 3, y: 4 }), { x: 3, y: 4 });
  });

  it('zooms to 3200 % at most and keeps the point under the cursor still', () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(MAX_ZOOM).toBe(32);
    const view: ViewState = { x: 1000, y: 800, zoom: 1, rotation: 90 };
    const anchor = { x: 820, y: 130 };
    const before = screenToDrawing(view, canvas, anchor);
    const zoomed = zoomAt(view, canvas, anchor, 2.5);
    expect(zoomed.zoom).toBe(2.5);
    close(screenToDrawing(zoomed, canvas, anchor), before);
  });

  it('pans with the content under the pointer in every rotation', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const view: ViewState = { x: 400, y: 400, zoom: 2, rotation };
      const grab = { x: 300, y: 200 };
      const point = screenToDrawing(view, canvas, grab);
      const moved = panBy(view, 40, -25);
      close(drawingToScreen(moved, canvas, point), { x: 340, y: 175 });
    }
  });

  it('fits the page inside the canvas with a margin', () => {
    const view = fitView(a1, canvas, 0, 'page', 20);
    const rect = visibleDrawingRect(view, canvas);
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(a1.width);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(a1.height);
    // Height is the limiting dimension for an A1 sheet in a 1000x600 canvas.
    expect(view.zoom * BASE_SCALE * a1.height).toBeCloseTo(560);
  });

  it('fits the width and shows the top edge of the rotated drawing', () => {
    const view = fitView(a1, canvas, 90, 'width', 0);
    // Rotated 90°, the drawing's height spans the screen width.
    expect(view.zoom * BASE_SCALE * a1.height).toBeCloseTo(1000);
    const topLeft = screenToDrawing(view, canvas, { x: 1000, y: 0 });
    expect(topLeft.x).toBeCloseTo(0, 3);
  });

  it('normalises rotations and rotates by quarter turns', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(rotateBy({ x: 0, y: 0, zoom: 1, rotation: 270 }, 90).rotation).toBe(0);
  });

  it('frames a rectangle for "zoom to segment" (SEG-05)', () => {
    const view = viewForRect({ x: 100, y: 200, width: 400, height: 100 }, canvas, 0, 50);
    expect(view.x).toBe(300);
    expect(view.y).toBe(250);
    expect(view.zoom * BASE_SCALE * 400).toBeCloseTo(900);
  });
});
