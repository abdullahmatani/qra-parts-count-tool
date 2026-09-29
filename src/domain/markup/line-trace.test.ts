import { describe, expect, it } from 'vitest';
import type { XY } from './geometry';
import {
  LineTracer,
  cheapestPath,
  inkMap,
  lineAt,
  nearestLine,
  pathLength,
  type InkMap,
} from './line-trace';

/** A blank sheet with lines drawn two pixels thick, like a plotted pipe. */
function sheet(
  width: number,
  height: number,
  draw: (plot: (x: number, y: number) => void) => void,
) {
  const map: InkMap = { width, height, ink: new Float32Array(width * height) };
  const plot = (x: number, y: number) => {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px >= 0 && py >= 0 && px < width && py < height) map.ink[py * width + px] = 1;
    }
  };
  draw(plot);
  return map;
}

function segment(plot: (x: number, y: number) => void, a: XY, b: XY) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
  for (let i = 0; i <= steps; i += 1) {
    plot(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  }
}

/** Drags a tracer from `from` through `via`, a pixel at a time. */
function drag(map: InkMap, from: XY, via: XY[]): LineTracer {
  const tracer = new LineTracer(map, from);
  let last = from;
  for (const next of via) {
    const steps = Math.ceil(Math.hypot(next.x - last.x, next.y - last.y));
    for (let i = 1; i <= steps; i += 1) {
      tracer.moveTo({
        x: last.x + ((next.x - last.x) * i) / steps,
        y: last.y + ((next.y - last.y) * i) / steps,
      });
    }
    last = next;
  }
  return tracer;
}

describe('the highlighter line magnet', () => {
  it('reads ink from canvas pixels: dark or coloured and opaque', () => {
    const rgba = new Uint8ClampedArray([
      255, 255, 255, 255, 0, 0, 0, 255, 220, 0, 0, 255, 0, 0, 0, 0, 128, 128, 128, 255,
    ]);
    const { ink } = inkMap(rgba, 5, 1);
    // Paper and transparent pixels hold no ink; black and red do; grey half.
    expect([...ink].map((v) => Math.round(v * 10) / 10)).toEqual([0, 1, 1, 0, 0.5]);
  });

  it('finds the nearest line within reach', () => {
    const map = sheet(100, 100, (plot) => segment(plot, { x: 10, y: 50 }, { x: 90, y: 50 }));
    const p = nearestLine(map, { x: 40, y: 58 }, 12)!;
    expect(p.x).toBeCloseTo(40.5);
    expect(p.y).toBeCloseTo(51.5);
    expect(nearestLine(map, { x: 40, y: 70 }, 12)).toBeNull();
  });

  it('prefers a longer way along a line to a short cut across paper', () => {
    // A U: the ends are 20 px apart across paper, 120 px apart along the line.
    const map = sheet(100, 100, (plot) => {
      segment(plot, { x: 40, y: 10 }, { x: 40, y: 60 });
      segment(plot, { x: 40, y: 60 }, { x: 60, y: 60 });
      segment(plot, { x: 60, y: 60 }, { x: 60, y: 10 });
    });
    // The search box reaches the bottom of the U.
    const path = cheapestPath(map, { x: 40.5, y: 10.5 }, { x: 60.5, y: 10.5 }, 60);
    expect(Math.max(...path.map((p) => p.y))).toBeGreaterThan(59);
    expect(pathLength(path)).toBeGreaterThan(110);
  });

  it('keeps to a straight line though the hand wanders off it', () => {
    const map = sheet(200, 100, (plot) => segment(plot, { x: 5, y: 50 }, { x: 195, y: 50 }));
    const tracer = drag(map, { x: 10, y: 55 }, [
      { x: 60, y: 43 },
      { x: 120, y: 58 },
      { x: 185, y: 46 },
    ]);
    const path = tracer.path();
    expect(tracer.onLine).toBe(true);
    for (const p of path) expect(Math.abs(p.y - 51)).toBeLessThanOrEqual(1);
    expect(path[0]!.x).toBeLessThan(12);
    expect(path.at(-1)!.x).toBeGreaterThan(183);
  });

  it('goes round a corner the hand cut', () => {
    const map = sheet(200, 200, (plot) => {
      segment(plot, { x: 20, y: 50 }, { x: 120, y: 50 });
      segment(plot, { x: 120, y: 50 }, { x: 120, y: 180 });
    });
    const tracer = drag(map, { x: 22, y: 53 }, [
      { x: 95, y: 56 },
      { x: 112, y: 70 },
      { x: 116, y: 110 },
      { x: 118, y: 170 },
    ]);
    const path = tracer.path();
    const corner = Math.min(...path.map((p) => Math.hypot(p.x - 121, p.y - 51)));
    // Within the two-pixel line, through its corner.
    expect(corner).toBeLessThan(2);
    // Every point is on the line: nothing cuts across the corner.
    for (const p of path) {
      const onTop = Math.abs(p.y - 51) <= 1 && p.x <= 122;
      const onSide = Math.abs(p.x - 121) <= 1 && p.y >= 50;
      expect(onTop || onSide, `${p.x},${p.y}`).toBe(true);
    }
  });

  it('follows a curve', () => {
    const centre = { x: 100, y: 100 };
    const map = sheet(200, 200, (plot) => {
      for (let a = 0; a <= Math.PI; a += 0.005) {
        plot(centre.x + 60 * Math.cos(a), centre.y + 60 * Math.sin(a));
      }
    });
    const hand = Array.from({ length: 13 }, (_, i) => {
      const a = (i / 12) * Math.PI * 0.95 + 0.05;
      const r = i % 2 ? 67 : 55;
      return { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) };
    });
    const path = drag(map, hand[0]!, hand.slice(1)).path();
    for (const p of path) {
      expect(Math.abs(Math.hypot(p.x - centre.x - 0.5, p.y - centre.y - 0.5) - 60)).toBeLessThan(2);
    }
    expect(pathLength(path)).toBeGreaterThan(150);
  });

  it('follows the pointer over paper, and starts exactly where told', () => {
    const map = sheet(100, 100, () => {});
    const tracer = drag(map, { x: 10, y: 10 }, [{ x: 50, y: 30 }]);
    expect(tracer.onLine).toBe(false);
    const path = tracer.path();
    expect(path[0]).toEqual({ x: 10, y: 10 });
    expect(path.at(-1)).toEqual({ x: 50, y: 30 });

    const lined = sheet(100, 100, (plot) => segment(plot, { x: 0, y: 20 }, { x: 99, y: 20 }));
    expect(new LineTracer(lined, { x: 30, y: 25 }, { exact: true }).path()).toEqual([
      { x: 30, y: 25 },
    ]);
    expect(new LineTracer(lined, { x: 30, y: 25 }).path()[0]!.y).toBeCloseTo(21.5);
  });
});

describe('the drawn line under a click', () => {
  it('gives a point on the middle of the line and its direction', () => {
    const map = sheet(100, 100, (plot) => {
      segment(plot, { x: 10, y: 50 }, { x: 90, y: 50 });
      segment(plot, { x: 20, y: 10 }, { x: 80, y: 70 });
    });
    const level = lineAt(map, { x: 30, y: 55 }, 8)!;
    expect(level.angle).toBeCloseTo(0, 5);
    expect(level.point.y).toBeCloseTo(51, 0);
    const slant = lineAt(map, { x: 40, y: 27 }, 8)!;
    expect(slant.angle).toBeCloseTo(Math.PI / 4, 1);
    expect(Math.abs(slant.point.y - slant.point.x - (10 - 20) - 1)).toBeLessThan(1.5);
    // Nothing near, or a crossing with no one direction.
    expect(lineAt(map, { x: 50, y: 90 }, 8)).toBeNull();
    const cross = sheet(100, 100, (plot) => {
      segment(plot, { x: 10, y: 50 }, { x: 90, y: 50 });
      segment(plot, { x: 50, y: 10 }, { x: 50, y: 90 });
    });
    expect(lineAt(cross, { x: 50, y: 50 }, 8)).toBeNull();
  });
});
