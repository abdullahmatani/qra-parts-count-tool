import { describe, expect, it } from 'vitest';
import type { MarkerGeometry } from '../schema/types';
import {
  boxFromPoints,
  dedupePoints,
  geometryBounds,
  geometryHandles,
  hitsGeometry,
  markersInBox,
  pickMarker,
  rectGeometry,
  resizeGeometry,
  translateGeometry,
} from './geometry';

const circle: MarkerGeometry = { type: 'circle', cx: 100, cy: 100, r: 10 };
const rect: MarkerGeometry = { type: 'rect', x: 50, y: 50, width: 200, height: 100 };
const line: MarkerGeometry = {
  type: 'polyline',
  points: [
    [0, 0],
    [100, 0],
    [100, 100],
  ],
};

describe('bounds and hit testing (ANN-02)', () => {
  it('computes bounds for every geometry type', () => {
    expect(geometryBounds(circle)).toEqual({ minX: 90, minY: 90, maxX: 110, maxY: 110 });
    expect(geometryBounds(rect)).toEqual({ minX: 50, minY: 50, maxX: 250, maxY: 150 });
    expect(geometryBounds(line)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });

  it('hits the inside of circles and rectangles, and near polylines', () => {
    expect(hitsGeometry(circle, { x: 105, y: 100 }, 0)).toBe(true);
    expect(hitsGeometry(circle, { x: 112, y: 100 }, 1)).toBe(false);
    expect(hitsGeometry(circle, { x: 112, y: 100 }, 3)).toBe(true);
    expect(hitsGeometry(rect, { x: 60, y: 60 }, 0)).toBe(true);
    expect(hitsGeometry(line, { x: 50, y: 2 }, 3)).toBe(true);
    expect(hitsGeometry(line, { x: 50, y: 50 }, 3)).toBe(false);
  });

  it('picks the smallest marker under the pointer', () => {
    const markers = [
      { id: 'area', geometry: rect },
      { id: 'valve', geometry: circle },
    ];
    expect(pickMarker(markers, { x: 100, y: 100 }, 1)?.id).toBe('valve');
    expect(pickMarker(markers, { x: 200, y: 100 }, 1)?.id).toBe('area');
    expect(pickMarker(markers, { x: 400, y: 400 }, 1)).toBeNull();
  });

  it('box-selects markers that lie completely inside the box (ANN-04)', () => {
    const markers = [
      { id: 'a', geometry: circle },
      { id: 'b', geometry: rect },
    ];
    const box = boxFromPoints({ x: 80, y: 80 }, { x: 120, y: 120 });
    expect(markersInBox(markers, box).map((m) => m.id)).toEqual(['a']);
  });
});

describe('moving and resizing (ANN-04)', () => {
  it('translates every geometry type', () => {
    expect(translateGeometry(circle, 5, -5)).toMatchObject({ cx: 105, cy: 95 });
    expect(translateGeometry(rect, 5, -5)).toMatchObject({ x: 55, y: 45 });
    expect(translateGeometry(line, 1, 1)).toMatchObject({
      points: [
        [1, 1],
        [101, 1],
        [101, 101],
      ],
    });
  });

  it('resizes a circle by its radius', () => {
    expect(resizeGeometry(circle, 'e', { x: 130, y: 100 })).toMatchObject({ r: 30 });
    expect(resizeGeometry(circle, 'n', { x: 100, y: 100 })).toMatchObject({ r: 0.5 });
  });

  it('resizes a rectangle by an edge or corner, flipping when dragged across', () => {
    expect(resizeGeometry(rect, 'se', { x: 300, y: 200 })).toEqual({
      type: 'rect',
      x: 50,
      y: 50,
      width: 250,
      height: 150,
    });
    expect(resizeGeometry(rect, 'w', { x: 300, y: 0 })).toEqual({
      type: 'rect',
      x: 250,
      y: 50,
      width: 50,
      height: 100,
    });
  });

  it('moves one polyline vertex', () => {
    const moved = resizeGeometry(line, 'v1', { x: 120, y: 10 });
    expect(moved).toMatchObject({
      points: [
        [0, 0],
        [120, 10],
        [100, 100],
      ],
    });
    expect(resizeGeometry(line, 'v9', { x: 0, y: 0 })).toBe(line);
  });

  it('lists handles for each geometry', () => {
    expect(geometryHandles(circle).map((h) => h.id)).toEqual(['e', 's', 'w', 'n']);
    expect(geometryHandles(rect)).toHaveLength(8);
    expect(geometryHandles(line).map((h) => h.id)).toEqual(['v0', 'v1', 'v2']);
  });
});

describe('drawing helpers', () => {
  it('builds a normalised rectangle from two corners', () => {
    expect(rectGeometry({ x: 10, y: 20 }, { x: 0, y: 0 })).toEqual({
      type: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    });
  });

  it('drops repeated points, such as from a double-click', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10.1, y: 0 },
      { x: 10, y: 0.2 },
    ];
    expect(dedupePoints(points, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });
});
