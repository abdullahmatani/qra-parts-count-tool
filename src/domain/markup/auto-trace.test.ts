import { describe, expect, it } from 'vitest';
import {
  TraceGraph,
  lineMask,
  thin,
  traceSegment,
  traceSheetFromMask,
  type BoundarySides,
  type TraceBarrier,
} from './auto-trace';
import type { XY } from './geometry';

/** A blank sheet to draw thick lines on. */
function sheet(width: number, height: number) {
  const mask = new Uint8Array(width * height);
  const disc = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) mask[y * width + x] = 1;
      }
    }
  };
  return {
    width,
    height,
    mask,
    /** A line from `a` to `b`, `thickness` pixels wide. */
    line(a: XY, b: XY, thickness = 3) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
      for (let i = 0; i <= steps; i += 1) {
        disc(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, thickness / 2);
      }
    },
    /** An arc round (cx, cy) from angle `from` to `to` (radians, y down). */
    arc(cx: number, cy: number, radius: number, from: number, to: number, thickness = 3) {
      const steps = Math.ceil(Math.abs(to - from) * radius * 2);
      for (let i = 0; i <= steps; i += 1) {
        const t = from + ((to - from) * i) / steps;
        disc(cx + radius * Math.cos(t), cy + radius * Math.sin(t), thickness / 2);
      }
    },
    graph(barriers: TraceBarrier[] = []) {
      return new TraceGraph(traceSheetFromMask(mask.slice(), width, height), barriers);
    },
  };
}

/** The pixels set in a mask, as points. */
function points(mask: Uint8Array, width: number): XY[] {
  const out: XY[] = [];
  mask.forEach((v, i) => {
    if (v) out.push({ x: (i % width) + 0.5, y: Math.floor(i / width) + 0.5 });
  });
  return out;
}

/** How many 8-connected pieces the set pixels make. */
function pieces(mask: Uint8Array, width: number): number {
  const seen = new Uint8Array(mask.length);
  let count = 0;
  for (let p = 0; p < mask.length; p += 1) {
    if (!mask[p] || seen[p]) continue;
    count += 1;
    const stack = [p];
    seen[p] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      for (const d of [1, -1, width, -width, width + 1, width - 1, -width + 1, -width - 1]) {
        if (mask[q + d] && !seen[q + d]) {
          seen[q + d] = 1;
          stack.push(q + d);
        }
      }
    }
  }
  return count;
}

const disc = (id: string, cx: number, cy: number, r: number): TraceBarrier => ({
  id,
  shape: { type: 'disc', cx, cy, r },
});

/** A bar across a horizontal pipe at `x`, as an ESDV double line or end flange. */
const bar = (id: string, x: number, y: number): TraceBarrier => ({
  id,
  shape: { type: 'box', cx: x, cy: y, ux: 0, uy: 1, halfLength: 12, halfWidth: 3 },
});

const allPoints = (paths: XY[][]) => paths.flat();

describe('thinning', () => {
  it('thins a thick line to one joined-up centre line, ends kept', () => {
    const s = sheet(120, 40);
    s.line({ x: 10, y: 20 }, { x: 110, y: 20 }, 7);
    const mask = s.mask.slice();
    thin(mask, s.width);
    const kept = points(mask, s.width);
    expect(pieces(mask, s.width)).toBe(1);
    for (const p of kept) expect(Math.abs(p.y - 20)).toBeLessThanOrEqual(1);
    expect(Math.min(...kept.map((p) => p.x))).toBeLessThan(14);
    expect(Math.max(...kept.map((p) => p.x))).toBeGreaterThan(106);
    // One pixel wide: about one pixel per column.
    expect(kept.length).toBeLessThan(110);
  });

  it('keeps two-pixel diagonal lines and curves joined up', () => {
    const s = sheet(200, 120);
    s.line({ x: 10, y: 10 }, { x: 100, y: 100 }, 2);
    s.arc(150, 60, 40, -Math.PI / 2, Math.PI / 2, 2);
    const mask = s.mask.slice();
    thin(mask, s.width);
    expect(pieces(mask, s.width)).toBe(2);
  });

  it('reads line ink from rendered pixels', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    const set = (i: number, r: number, g: number, b: number) => rgba.set([r, g, b, 255], i * 4);
    set(5, 0, 0, 0); // black
    set(6, 200, 200, 200); // faint grey
    set(9, 255, 0, 0); // red
    expect([...lineMask(rgba, 4, 4)].flatMap((v, i) => (v ? [i] : []))).toEqual([5, 9]);
  });
});

describe('tracing the line work', () => {
  it('follows a pipe round corners and into every branch of a tee', () => {
    const s = sheet(200, 200);
    s.line({ x: 20, y: 50 }, { x: 150, y: 50 });
    s.line({ x: 150, y: 50 }, { x: 150, y: 180 });
    s.line({ x: 80, y: 50 }, { x: 80, y: 120 }); // a tee off the run
    s.line({ x: 20, y: 150 }, { x: 100, y: 150 }); // another pipe
    const graph = s.graph();
    const region = graph.trace(graph.edgesNear({ x: 40, y: 51 }, 5));
    const traced = allPoints(graph.paths(region));
    const near = (x: number, y: number) => traced.some((p) => Math.hypot(p.x - x, p.y - y) <= 2.5);
    expect(near(22, 50)).toBe(true);
    expect(near(150, 178)).toBe(true);
    expect(near(80, 118)).toBe(true);
    expect(traced.some((p) => p.y > 140 && p.x < 110)).toBe(false);
    expect(region.reached).toEqual([]);
  });

  it('runs straight over a crossing and does not turn onto the other line', () => {
    const s = sheet(200, 200);
    s.line({ x: 20, y: 100 }, { x: 180, y: 100 });
    s.line({ x: 100, y: 20 }, { x: 100, y: 180 });
    const graph = s.graph();
    const region = graph.trace(graph.edgesNear({ x: 40, y: 100 }, 5));
    const traced = allPoints(graph.paths(region));
    expect(traced.some((p) => p.x > 175)).toBe(true);
    expect(traced.every((p) => Math.abs(p.y - 100) <= 2)).toBe(true);
    // Traced from the other line, only the other line.
    const other = allPoints(graph.paths(graph.trace(graph.edgesNear({ x: 100, y: 30 }, 5))));
    expect(other.some((p) => p.y > 175)).toBe(true);
    expect(other.every((p) => Math.abs(p.x - 100) <= 2)).toBe(true);
  });

  // Thick lines crossing at a slant thin to two tees joined by a short bridge.
  it.each([
    [90, 3],
    [90, 8],
    [60, 3],
    [60, 6],
    [45, 3],
    [45, 6],
    [30, 3],
  ])('runs straight over lines crossing at %i° (%i px thick)', (angle, thickness) => {
    const s = sheet(300, 300);
    const a = (angle * Math.PI) / 180;
    const reach = { x: 120 * Math.cos(a), y: 120 * Math.sin(a) };
    s.line({ x: 20, y: 150 }, { x: 280, y: 150 }, thickness);
    s.line(
      { x: 150 - reach.x, y: 150 - reach.y },
      { x: 150 + reach.x, y: 150 + reach.y },
      thickness,
    );
    const graph = s.graph();
    const traced = allPoints(graph.paths(graph.trace(graph.edgesNear({ x: 40, y: 150 }, 5))));
    expect(traced.every((p) => Math.abs(p.y - 150) <= 3)).toBe(true);
    expect(traced.some((p) => p.x > 270)).toBe(true);
  });

  it.each([
    [10, 3],
    [10, 6],
    [16, 6],
  ])('takes both branches of tees %i px apart (%i px thick)', (gap, thickness) => {
    const s = sheet(300, 300);
    s.line({ x: 20, y: 150 }, { x: 280, y: 150 }, thickness);
    s.line({ x: 150, y: 150 }, { x: 150, y: 40 }, thickness);
    s.line({ x: 150 + gap, y: 150 }, { x: 150 + gap, y: 260 }, thickness);
    const graph = s.graph();
    const traced = allPoints(graph.paths(graph.trace(graph.edgesNear({ x: 40, y: 150 }, 5))));
    expect(traced.some((p) => p.y < 50)).toBe(true);
    expect(traced.some((p) => p.y > 250)).toBe(true);
  });

  it('follows curves', () => {
    const s = sheet(200, 200);
    s.line({ x: 20, y: 40 }, { x: 100, y: 40 });
    s.arc(100, 100, 60, -Math.PI / 2, 0);
    s.line({ x: 160, y: 100 }, { x: 160, y: 180 });
    const graph = s.graph();
    const region = graph.trace(graph.edgesNear({ x: 30, y: 40 }, 5));
    const traced = allPoints(graph.paths(region));
    expect(traced.some((p) => p.y > 175)).toBe(true);
    for (const p of traced.filter((q) => q.x > 104 && q.y < 96)) {
      expect(Math.abs(Math.hypot(p.x - 100, p.y - 100) - 60)).toBeLessThanOrEqual(1.5);
    }
  });

  it('stops at boundaries and links, and says which it ran into', () => {
    const s = sheet(300, 100);
    s.line({ x: 10, y: 50 }, { x: 290, y: 50 });
    s.line({ x: 150, y: 50 }, { x: 150, y: 95 }); // a branch into a connector box
    const graph = s.graph([
      disc('esdv', 60, 50, 8),
      bar('flange', 230, 50),
      {
        id: 'link',
        shape: { type: 'box', cx: 150, cy: 90, ux: 1, uy: 0, halfLength: 20, halfWidth: 8 },
      },
    ]);
    const region = graph.trace(graph.edgesNear({ x: 150, y: 50 }, 3));
    expect(region.reached.sort()).toEqual(['esdv', 'flange', 'link']);
    const traced = allPoints(graph.paths(region));
    expect(Math.min(...traced.map((p) => p.x))).toBeGreaterThan(60 + 8);
    expect(Math.max(...traced.map((p) => p.x))).toBeLessThan(230 - 3);
    expect(Math.max(...traced.map((p) => p.y))).toBeLessThan(90 - 8);
    // The pipes that leave each boundary.
    expect(graph.edgesAt('esdv')).toHaveLength(2);
    expect(graph.edgesAt('flange')).toHaveLength(2);
  });

  it('gives the paths end to end, straightened, without stubs off the line', () => {
    const s = sheet(200, 60);
    s.line({ x: 10, y: 30 }, { x: 190, y: 30 });
    s.line({ x: 100, y: 30 }, { x: 100, y: 25 }, 2); // a nick, as of a letter touching the line
    const graph = s.graph();
    const region = graph.trace(graph.edgesNear({ x: 20, y: 30 }, 3));
    const paths = graph.paths(region, 8);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.length).toBeLessThanOrEqual(6);
    expect(Math.abs(paths[0]![0]!.x - paths[0]![paths[0]!.length - 1]!.x)).toBeGreaterThan(170);
  });
});

describe('tracing a segment from its boundaries', () => {
  // A pipe from the left, through ESDV A, the segment, ESDV B, and on.
  function layout() {
    const s = sheet(420, 200);
    s.line({ x: 10, y: 100 }, { x: 410, y: 100 });
    s.line({ x: 200, y: 100 }, { x: 200, y: 180 }); // a branch of the segment
    return s;
  }
  const esdvs: BoundarySides[] = [
    { id: 'A', sides: ['up', 'S'] },
    { id: 'B', sides: ['S', 'down'] },
  ];

  it('traces the segment between its ESDVs, not the pipe beyond them', () => {
    const graph = layout().graph([disc('A', 100, 100, 8), disc('B', 320, 100, 8)]);
    const result = traceSegment(graph, 'S', esdvs);
    expect(result.undecided).toEqual([]);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.reached.sort()).toEqual(['A', 'B']);
    const traced = allPoints(graph.paths(result.regions[0]!));
    expect(Math.min(...traced.map((p) => p.x))).toBeGreaterThan(100);
    expect(Math.max(...traced.map((p) => p.x))).toBeLessThan(320);
    expect(Math.max(...traced.map((p) => p.y))).toBeGreaterThan(175);
    // The segment upstream has only A here: the pipe past A is S's, so the
    // pipe before it is its own.
    const up = traceSegment(graph, 'up', esdvs);
    expect(up.undecided).toEqual([]);
    expect(up.regions).toHaveLength(1);
    const upstream = allPoints(graph.paths(up.regions[0]!));
    expect(Math.max(...upstream.map((p) => p.x))).toBeLessThan(100);
  });

  it('decides the side of an end flange by what the segment reaches', () => {
    const s = sheet(420, 200);
    s.line({ x: 10, y: 100 }, { x: 300, y: 100 });
    s.line({ x: 300, y: 20 }, { x: 300, y: 190 }); // the closed drain header past the flange
    const graph = s.graph([disc('A', 100, 100, 8), bar('F', 250, 100)]);
    const result = traceSegment(graph, 'S', [
      { id: 'A', sides: ['up', 'S'] },
      { id: 'F', sides: ['S'], endFlange: true },
    ]);
    expect(result.regions).toHaveLength(1);
    const traced = allPoints(graph.paths(result.regions[0]!));
    expect(Math.min(...traced.map((p) => p.x))).toBeGreaterThan(100);
    expect(Math.max(...traced.map((p) => p.x))).toBeLessThan(250);
    expect(result.undecided).toEqual([]);
  });

  it('leaves both sides undecided when nothing tells them apart', () => {
    const s = sheet(300, 100);
    s.line({ x: 10, y: 50 }, { x: 290, y: 50 });
    const graph = s.graph([disc('A', 150, 50, 8)]);
    const result = traceSegment(graph, 'S', [{ id: 'A', sides: ['up', 'S'] }]);
    expect(result.regions).toEqual([]);
    expect(result.undecided).toHaveLength(2);
    // Short bits (of a valve symbol sticking out of the ring) are dropped.
    expect(traceSegment(graph, 'S', [{ id: 'A', sides: ['up', 'S'] }], 200).undecided).toEqual([]);
  });

  it('decides by elimination when the other side is known to be another segment', () => {
    const s = sheet(420, 100);
    s.line({ x: 10, y: 50 }, { x: 410, y: 50 });
    const graph = s.graph([disc('A', 100, 50, 8), disc('B', 300, 50, 8)]);
    // B lies between two other segments: the pipe left of it is not S, so the
    // pipe left of A must be.
    const result = traceSegment(graph, 'S', [
      { id: 'A', sides: ['S', 'T'] },
      { id: 'B', sides: ['T', 'U'] },
    ]);
    expect(result.regions).toHaveLength(1);
    const traced = allPoints(graph.paths(result.regions[0]!));
    expect(Math.max(...traced.map((p) => p.x))).toBeLessThan(100);
  });
});
