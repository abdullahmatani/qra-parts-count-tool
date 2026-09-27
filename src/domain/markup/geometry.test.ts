import { describe, expect, it } from 'vitest';
import type { MarkerGeometry } from '../schema/types';
import {
  DOT_SCALE,
  MAX_OUTLINE_POINTS,
  boxFromPoints,
  dedupePoints,
  doubleLineStrokes,
  doubleLineTop,
  freeformSymbol,
  geometryBounds,
  geometryHandles,
  hitsGeometry,
  markersInBox,
  pickMarker,
  radiusForSymbol,
  rectGeometry,
  resizeGeometry,
  simplifyPath,
  symbolPolygon,
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

describe('marker shapes: ring, dot, square and free-form', () => {
  const g = { type: 'circle' as const, cx: 100, cy: 100, r: 10 };
  const diamond = {
    symbol: 'freeform' as const,
    outline: [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as [number, number][],
  };

  it('outlines a square on the circle and a free-form shape scaled by the radius', () => {
    expect(symbolPolygon(g, { symbol: 'circle', outline: null })).toBeNull();
    expect(symbolPolygon(g, { symbol: 'dot', outline: null })).toBeNull();
    expect(symbolPolygon(g, { symbol: 'square', outline: null })).toEqual([
      { x: 90, y: 90 },
      { x: 110, y: 90 },
      { x: 110, y: 110 },
      { x: 90, y: 110 },
    ]);
    expect(symbolPolygon(g, diamond)).toEqual([
      { x: 100, y: 90 },
      { x: 110, y: 100 },
      { x: 100, y: 110 },
      { x: 90, y: 100 },
    ]);
  });

  it('hits a square in its corners and a free-form shape only inside or near it', () => {
    const corner = { x: 109, y: 109 };
    expect(hitsGeometry(g, corner, 0)).toBe(false);
    expect(hitsGeometry(g, corner, 0, { symbol: 'square', outline: null })).toBe(true);
    expect(hitsGeometry(g, { x: 104, y: 104 }, 0, diamond)).toBe(true);
    expect(hitsGeometry(g, { x: 108, y: 108 }, 0, diamond)).toBe(false);
    // (108, 108) is 6/√2 ≈ 4.2 from the edge x + y = 210.
    expect(hitsGeometry(g, { x: 108, y: 108 }, 4, diamond)).toBe(false);
    expect(hitsGeometry(g, { x: 108, y: 108 }, 5, diamond)).toBe(true);
    const markers = [
      { id: 'sq', geometry: g, style: { symbol: 'square' as const, outline: null } },
    ];
    expect(pickMarker(markers, corner, 0)?.id).toBe('sq');
  });

  it('keeps a dot at a fraction of the ring around the same symbol', () => {
    expect(radiusForSymbol(10, 'circle', 'dot')).toBeCloseTo(10 * DOT_SCALE);
    expect(radiusForSymbol(10 * DOT_SCALE, 'dot', 'square')).toBeCloseTo(10);
    expect(radiusForSymbol(10, 'freeform', 'circle')).toBe(10);
  });

  it('simplifies a hand-drawn path to the points that shape it', () => {
    const wobbly = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: -0.1 },
      { x: 10, y: 10 },
    ];
    expect(simplifyPath(wobbly, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: -0.1 },
      { x: 10, y: 10 },
    ]);
  });

  it('turns a traced path into its bounding circle and a unit outline', () => {
    const path = [
      { x: 90, y: 100 },
      { x: 100, y: 90 },
      { x: 110, y: 100 },
      { x: 100, y: 110 },
    ];
    const shape = freeformSymbol(path)!;
    expect(shape.geometry).toEqual({ type: 'circle', cx: 100, cy: 100, r: 10 });
    expect(shape.outline).toEqual([
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ]);
    // A straight stroke encloses nothing.
    expect(
      freeformSymbol([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBeNull();
    // Long paths are thinned to the most points an outline keeps.
    const circle = Array.from({ length: 2000 }, (_, i) => ({
      x: Math.cos((i / 2000) * 2 * Math.PI) * 50,
      y: Math.sin((i / 2000) * 2 * Math.PI) * 50,
    }));
    expect(freeformSymbol(circle)!.outline).toHaveLength(MAX_OUTLINE_POINTS);
  });
});

describe('highlighter strokes', () => {
  const stroke: MarkerGeometry = {
    type: 'stroke',
    points: [
      [0, 0],
      [100, 0],
    ],
    width: 10,
  };

  it('covers half its width either side of its path', () => {
    expect(geometryBounds(stroke)).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 5 });
    expect(hitsGeometry(stroke, { x: 50, y: 4 }, 0)).toBe(true);
    expect(hitsGeometry(stroke, { x: 50, y: 7 }, 0)).toBe(false);
    expect(hitsGeometry(stroke, { x: 50, y: 7 }, 3)).toBe(true);
  });

  it('moves with its points and has no resize handles', () => {
    expect(translateGeometry(stroke, 5, 5)).toEqual({
      type: 'stroke',
      points: [
        [5, 5],
        [105, 5],
      ],
      width: 10,
    });
    expect(geometryHandles(stroke)).toEqual([]);
    expect(resizeGeometry(stroke, 'e', { x: 0, y: 0 })).toBe(stroke);
  });
});

describe('ESDV double lines', () => {
  // Upright across a horizontal pipe at y = 50.
  const line: MarkerGeometry = {
    type: 'doubleLine',
    points: [
      [100, 40],
      [100, 60],
    ],
    gap: 6,
  };

  it('draws two lines half the gap either side of its centre line', () => {
    if (line.type !== 'doubleLine') throw new Error('unreachable');
    const [first, second] = doubleLineStrokes(line);
    expect(first.map((p) => p.x)).toEqual([97, 97]);
    expect(second.map((p) => p.x)).toEqual([103, 103]);
    expect(geometryBounds(line)).toEqual({ minX: 97, minY: 40, maxX: 103, maxY: 60 });
    // The label goes by the top of the right-hand line.
    expect(doubleLineTop(line)).toEqual({ x: 103, y: 40 });
  });

  it('is hit on either line and in the gap between them', () => {
    expect(hitsGeometry(line, { x: 100, y: 50 }, 0)).toBe(true);
    expect(hitsGeometry(line, { x: 103, y: 45 }, 0)).toBe(true);
    expect(hitsGeometry(line, { x: 106, y: 45 }, 0)).toBe(false);
    expect(hitsGeometry(line, { x: 106, y: 45 }, 4)).toBe(true);
    expect(hitsGeometry(line, { x: 100, y: 70 }, 4)).toBe(false);
  });

  it('moves with its ends, and each end is a handle', () => {
    expect(translateGeometry(line, 5, -5)).toEqual({
      type: 'doubleLine',
      points: [
        [105, 35],
        [105, 55],
      ],
      gap: 6,
    });
    expect(geometryHandles(line).map((h) => h.id)).toEqual(['v0', 'v1']);
    expect(resizeGeometry(line, 'v1', { x: 120, y: 60 })).toEqual({
      type: 'doubleLine',
      points: [
        [100, 40],
        [120, 60],
      ],
      gap: 6,
    });
    // Both ends in one place would leave it without a direction.
    expect(resizeGeometry(line, 'v1', { x: 100, y: 40 })).toBe(line);
  });
});
