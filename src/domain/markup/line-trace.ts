/**
 * The highlighter's line magnet: a stroke dragged roughly along a pipe comes
 * out on the pipe's line, round its bends and corners.
 *
 * It works on the drawing as it is shown (PDF, DWG and DXF alike), one cell
 * per screen pixel. Dark pixels are cheap to travel along and paper is dear,
 * so the cheapest path between two points on a line keeps to the line
 * (Dijkstra's algorithm, as in the "intelligent scissors" of image editors).
 * Away from the linework the stroke follows the pointer, as without the magnet.
 */
import type { XY } from './geometry';

/** How much line (0 paper … 1 line) each pixel of a drawing holds. */
export interface InkMap {
  width: number;
  height: number;
  ink: Float32Array;
}

/** This much ink counts as a whole line: faint, thin or anti-aliased lines still pull. */
const FULL_INK = 0.35;
/** Pixels with less than this share of a line are not a line to snap to. */
const SNAP_STRENGTH = 0.5;
/** A step across paper costs this many times a step along a line. */
const PAPER_COST = 12;
/** Beyond this many pixels, or this far (px), a path search gives way to a straight step. */
const MAX_SEARCH_PIXELS = 250_000;
const MAX_SEARCH_DISTANCE = 240;

/** Ink from canvas pixels: anything darker or more coloured than white paper, weighted by opacity. */
export function inkMap(rgba: Uint8ClampedArray, width: number, height: number): InkMap {
  const ink = new Float32Array(width * height);
  for (let i = 0, p = 0; i < ink.length; i += 1, p += 4) {
    const lightest = Math.min(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!);
    ink[i] = (rgba[p + 3]! / 255) * (1 - lightest / 255);
  }
  return { width, height, ink };
}

/** How much of a line a pixel is, 0 to 1. */
function strength(map: InkMap, index: number): number {
  return Math.min(1, map.ink[index]! / FULL_INK);
}

/**
 * As `strength`, with a little of the pixel's neighbourhood mixed in, so a
 * path keeps to the middle of a line that is several pixels thick.
 */
function centredStrength(map: InkMap, x: number, y: number): number {
  let sum = 0;
  let n = 0;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(map.height - 1, y + 1); yy += 1) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(map.width - 1, x + 1); xx += 1) {
      sum += map.ink[yy * map.width + xx]!;
      n += 1;
    }
  }
  const ink = 0.6 * map.ink[y * map.width + x]! + (0.4 * sum) / n;
  return Math.min(1, ink / FULL_INK);
}

const cellOf = (map: InkMap, p: XY) => ({
  x: Math.min(map.width - 1, Math.max(0, Math.floor(p.x))),
  y: Math.min(map.height - 1, Math.max(0, Math.floor(p.y))),
});
const centreOf = (x: number, y: number): XY => ({ x: x + 0.5, y: y + 0.5 });

/** The middle of the nearest line pixel within `radius` pixels of `p`, or null. */
export function nearestLine(map: InkMap, p: XY, radius: number): XY | null {
  const r = Math.ceil(radius);
  const c = cellOf(map, p);
  let best: XY | null = null;
  let bestDistance = radius * radius;
  for (let y = Math.max(0, c.y - r); y <= Math.min(map.height - 1, c.y + r); y += 1) {
    for (let x = Math.max(0, c.x - r); x <= Math.min(map.width - 1, c.x + r); x += 1) {
      if (strength(map, y * map.width + x) < SNAP_STRENGTH) continue;
      const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
      if (d <= bestDistance) {
        best = centreOf(x, y);
        bestDistance = d;
      }
    }
  }
  return best;
}

/** A binary min-heap of pixel indices keyed by path cost. */
class Heap {
  private keys = new Float64Array(1024);
  private items = new Int32Array(1024);
  size = 0;

  push(item: number, key: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      const items = new Int32Array(this.size * 2);
      keys.set(this.keys);
      items.set(this.items);
      this.keys = keys;
      this.items = items;
    }
    let i = this.size;
    this.size += 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.keys[i] = this.keys[parent]!;
      this.items[i] = this.items[parent]!;
      i = parent;
    }
    this.keys[i] = key;
    this.items[i] = item;
  }

  pop(): number {
    const top = this.items[0]!;
    this.size -= 1;
    const key = this.keys[this.size]!;
    const item = this.items[this.size]!;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= this.size) break;
      const r = l + 1;
      const m = r < this.size && this.keys[r]! < this.keys[l]! ? r : l;
      if (this.keys[m]! >= key) break;
      this.keys[i] = this.keys[m]!;
      this.items[i] = this.items[m]!;
      i = m;
    }
    this.keys[i] = key;
    this.items[i] = item;
    return top;
  }
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * The cheapest path from `from` to `to` over the drawing's pixels: along the
 * lines where it can, across paper where it must. It searches the box round
 * both points, `pad` pixels wider, and returns pixel middles from start to end;
 * points too far apart for a quick search are joined by a straight step.
 */
export function cheapestPath(map: InkMap, from: XY, to: XY, pad = 24): XY[] {
  const a = cellOf(map, from);
  const b = cellOf(map, to);
  if (a.x === b.x && a.y === b.y) return [centreOf(a.x, a.y)];
  const x0 = Math.max(0, Math.min(a.x, b.x) - pad);
  const y0 = Math.max(0, Math.min(a.y, b.y) - pad);
  const x1 = Math.min(map.width - 1, Math.max(a.x, b.x) + pad);
  const y1 = Math.min(map.height - 1, Math.max(a.y, b.y) + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w * h > MAX_SEARCH_PIXELS || Math.hypot(b.x - a.x, b.y - a.y) > MAX_SEARCH_DISTANCE) {
    return [centreOf(a.x, a.y), centreOf(b.x, b.y)];
  }

  const cost = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      cost[y * w + x] = 1 + PAPER_COST * (1 - centredStrength(map, x + x0, y + y0));
    }
  }
  // A*: no step costs less than its length, so the distance left is a safe estimate.
  const gx = b.x - x0;
  const gy = b.y - y0;
  const estimate = (x: number, y: number) => Math.hypot(gx - x, gy - y);
  const distance = new Float64Array(w * h).fill(Infinity);
  const previous = new Int32Array(w * h).fill(-1);
  const start = (a.y - y0) * w + (a.x - x0);
  const goal = (b.y - y0) * w + (b.x - x0);
  distance[start] = 0;
  const done = new Uint8Array(w * h);
  const heap = new Heap();
  heap.push(start, estimate(a.x - x0, a.y - y0));
  while (heap.size > 0) {
    const u = heap.pop();
    if (u === goal) break;
    if (done[u]) continue;
    done[u] = 1;
    const du = distance[u]!;
    const ux = u % w;
    const uy = (u - ux) / w;
    for (const [dx, dy, step] of NEIGHBOURS) {
      const vx = ux + dx;
      const vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= w || vy >= h) continue;
      const v = vy * w + vx;
      const dv = du + ((cost[u]! + cost[v]!) / 2) * step;
      if (dv < distance[v]!) {
        distance[v] = dv;
        previous[v] = u;
        heap.push(v, dv + estimate(vx, vy));
      }
    }
  }
  const path: XY[] = [];
  for (let i = goal; i !== -1; i = previous[i]!) {
    const x = i % w;
    path.push(centreOf(x + x0, (i - x) / w + y0));
  }
  return path.reverse();
}

/** Length of a path in pixels. */
export function pathLength(path: readonly XY[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i += 1) {
    length += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  return length;
}

export interface TracerOptions {
  /** How near a line (px) the pointer must come for the magnet to take it. */
  snapRadius?: number;
  /** Once the path from the last anchor is this long (px), most of it is fixed. */
  anchorLength?: number;
  /** The end of the path (px) that stays free to follow the pointer. */
  tail?: number;
}

/**
 * Traces a stroke along the linework as the pointer moves, in pixels. Near a
 * line the path from the last anchor to the pointer follows the line; the
 * path is anchored as it grows, so it cannot swing to another line behind
 * the pointer. Away from the lines the path follows the pointer.
 */
export class LineTracer {
  private readonly map: InkMap;
  private readonly snapRadius: number;
  private readonly anchorLength: number;
  private readonly tail: number;
  private fixed: XY[];
  private live: XY[] = [];
  /** The end of the path: on a line when `onLine`, otherwise the pointer. */
  target: XY;
  onLine: boolean;

  /**
   * Starts at `start`, or on the line nearest to it unless `exact` (a stroke
   * that starts on an ESDV starts there).
   */
  constructor(map: InkMap, start: XY, options: TracerOptions & { exact?: boolean } = {}) {
    this.map = map;
    this.snapRadius = options.snapRadius ?? 12;
    this.anchorLength = options.anchorLength ?? 80;
    this.tail = options.tail ?? 24;
    const onLine = options.exact ? null : nearestLine(map, start, this.snapRadius);
    this.target = onLine ?? start;
    this.onLine = onLine !== null;
    this.fixed = [this.target];
  }

  /** The traced path so far, from the start to the target. */
  path(): XY[] {
    return this.live.length > 1 ? [...this.fixed, ...this.live.slice(1)] : [...this.fixed];
  }

  /** Follows the pointer to `p`. */
  moveTo(p: XY): void {
    // Once on a line, the magnet holds on a little further than it takes.
    const reach = this.onLine ? this.snapRadius * 1.5 : this.snapRadius;
    const line = nearestLine(this.map, p, reach);
    if (!line) {
      // Off the linework: keep what was traced, then follow the pointer.
      this.fixLive();
      this.fixed.push(p);
      this.target = p;
      this.onLine = false;
      return;
    }
    const seed = this.fixed[this.fixed.length - 1]!;
    this.live = cheapestPath(this.map, seed, line);
    this.live[0] = seed;
    this.target = line;
    this.onLine = true;
    const length = pathLength(this.live);
    if (length > this.anchorLength) this.anchorAt(length - this.tail);
  }

  /** Fixes the live path up to `distance` along it, and traces on from there. */
  private anchorAt(distance: number): void {
    let travelled = 0;
    let i = 1;
    for (; i < this.live.length - 1; i += 1) {
      const a = this.live[i - 1]!;
      const b = this.live[i]!;
      travelled += Math.hypot(b.x - a.x, b.y - a.y);
      if (travelled >= distance) break;
    }
    this.fixed.push(...this.live.slice(1, i + 1));
    this.live = this.live.slice(i);
  }

  private fixLive(): void {
    if (this.live.length > 1) this.fixed.push(...this.live.slice(1));
    this.live = [];
  }
}
