import { describe, expect, it } from 'vitest';
import { aciToRgb, rgbToCss } from './aci';
import {
  arcPoints,
  bulgePoints,
  circlePoints,
  ellipsePoints,
  polylinePoints,
  segmentsFor,
  splinePoints,
} from './geometry';
import { decodePercentCodes, mtextToLines } from './text-codes';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('CAD geometry', () => {
  it('chooses segment counts from the chord tolerance', () => {
    expect(segmentsFor(100, Math.PI * 2, 0.1)).toBeGreaterThan(60);
    expect(segmentsFor(1, Math.PI * 2, 0.1)).toBeLessThan(20);
    expect(segmentsFor(1e9, Math.PI * 2, 1e-9)).toBeLessThanOrEqual(720);
  });

  it('tessellates arcs counter-clockwise, wrapping through 360°', () => {
    const pts = arcPoints([0, 0], 10, Math.PI * 1.5, Math.PI * 0.5, 0.01);
    close(pts[0]![1], -10);
    close(pts.at(-1)![1], 10);
    // Passes through angle 0 (x = 10) on the way.
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(10, 2);
    const circle = circlePoints([5, 5], 2, 0.001);
    close(circle[0]![0], circle.at(-1)![0]);
  });

  it('turns a bulge of 1 into a half circle', () => {
    const pts = bulgePoints([0, 0], [2, 0], 1, 0.001);
    expect(pts.at(-1)).toEqual([2, 0]);
    // Counter-clockwise from (0,0) to (2,0) passes below the chord.
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(-1, 3);
    expect(bulgePoints([0, 0], [2, 0], 0, 0.1)).toEqual([[2, 0]]);
  });

  it('flattens closed polylines back to the first vertex', () => {
    const pts = polylinePoints(
      [
        { x: 0, y: 0, bulge: 0 },
        { x: 10, y: 0, bulge: 0 },
        { x: 10, y: 10, bulge: 0 },
      ],
      true,
      0.1,
    );
    expect(pts).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 0],
    ]);
  });

  it('tessellates rotated ellipses', () => {
    const pts = ellipsePoints([0, 0], [0, 10], 0.5, 0, Math.PI * 2, 0.01);
    close(pts[0]![0], 0);
    close(pts[0]![1], 10);
    expect(Math.max(...pts.map((p) => Math.abs(p[0])))).toBeCloseTo(5, 2);
  });

  it('evaluates clamped B-splines through their end points', () => {
    const cps: [number, number][] = [
      [0, 0],
      [5, 10],
      [10, 0],
    ];
    const pts = splinePoints(2, cps, [0, 0, 0, 1, 1, 1], undefined, [], 8);
    expect(pts[0]).toEqual([0, 0]);
    close(pts.at(-1)![0], 10);
    close(pts[4]![1], 5); // quadratic Bezier midpoint
    // Invalid knot vector: falls back to fit points.
    expect(
      splinePoints(3, cps, [0, 1], undefined, [
        [1, 1],
        [2, 2],
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('ACI colours and text codes', () => {
  it('maps the standard ACI colours', () => {
    expect(rgbToCss(aciToRgb(1))).toBe('#ff0000');
    expect(rgbToCss(aciToRgb(7))).toBe('#000000');
    expect(rgbToCss(aciToRgb(8))).toBe('#808080');
    expect(rgbToCss(aciToRgb(10))).toBe('#ff0000');
    expect(rgbToCss(aciToRgb(11))).toBe('#ff8080');
    expect(rgbToCss(aciToRgb(12))).toBe('#cc0000');
    expect(rgbToCss(aciToRgb(30))).toBe('#ff8000');
    expect(rgbToCss(aciToRgb(250))).toBe('#333333');
  });

  it('decodes %% codes and strips MTEXT formatting', () => {
    expect(decodePercentCodes('%%c50 %%p1%%d %%uX%%u 100%%%')).toBe('Ø50 ±1° X 100%');
    expect(mtextToLines('{\\fArial|b1;TAG}\\PLine \\H2.5;two\\S1^2;')).toEqual([
      'TAG',
      'Line two1/2',
    ]);
    expect(mtextToLines('A\\~B \\LUnder\\l \\{x\\}')).toEqual(['A B Under {x}']);
    expect(mtextToLines('\\U+00D8100')).toEqual(['Ø100']);
  });
});
