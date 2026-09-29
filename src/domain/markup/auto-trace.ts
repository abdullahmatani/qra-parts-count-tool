/**
 * Auto trace (SEG-06): highlights a segment's pipework by following the drawn
 * lines out to where the segment ends: its ESDVs and end flanges, and the
 * drawing links of off-page connectors, where the pipe carries on on another
 * drawing.
 *
 * It works on the drawing as rendered, as the highlighter's line magnet does,
 * so PDF, DWG and DXF drawings, straight runs, bends and curves are all traced
 * the same way:
 *
 * 1. The sheet's line ink is thinned to centre lines one pixel wide
 *    (directional thinning that deletes only simple points, so every line
 *    stays joined up and keeps its ends).
 * 2. The centre lines are cut at the ESDVs, end flanges and drawing links, and
 *    read as a graph: junctions and line ends, joined by runs of line.
 * 3. A trace runs along the graph from a start (a pipe the user clicks, or the
 *    pipes that leave the segment's own ESDVs and end flanges). It takes every
 *    branch at a tee but runs straight on over a crossing (four arms in two
 *    straight pairs), since lines that cross on a P&ID are not joined.
 * 4. What it covers comes back as paths for highlighter strokes, with the
 *    boundaries and links it ran into.
 *
 * Everything here is in the pixels of the rendered sheet; the caller converts
 * to drawing units.
 */
import { simplifyPath, type XY } from './geometry';

/** This much ink (0 paper … 1 black) makes a pixel part of a line. */
const INK_THRESHOLD = 0.3;
/** Junctions this close (px) are one junction: two lines crossing often thin to two tees. */
const MERGE_DISTANCE = 3;
/** How far along an arm (px) its direction is read. */
const ARM_LENGTH = 8;
/** Arms at least this straight (the cosine of the angle between them) run on over a crossing. */
const STRAIGHT = Math.cos((150 * Math.PI) / 180);
/**
 * Two lines crossing at a slant thin to two tees joined by a short bridge, up
 * to this long (px), where the arms of each line run on in one straight line,
 * within this many pixels of each other. Tees side by side on a pipe have
 * their branches a whole bridge's length apart, so they are not taken for a
 * crossing.
 */
const CROSSING_BRIDGE = 24;
const COLLINEAR = 3;
/** A line end this near (px) to a boundary or link has run into it. */
const REACH = 3;

// ---------------------------------------------------------------------------
// Centre lines
// ---------------------------------------------------------------------------

/** The sheet's line work thinned to centre lines one pixel wide. */
export interface TraceSheet {
  width: number;
  height: number;
  /** 1 on a centre line, 0 elsewhere. The outermost pixels are always 0. */
  skeleton: Uint8Array;
  /** The indices of the centre line pixels. */
  pixels: Int32Array;
}

/**
 * Line pixels of a rendered sheet: anything darker or more coloured than white
 * paper by `threshold`, weighted by opacity (as the line magnet reads ink).
 * The outermost pixels are left out, so neighbours never need bounds checks.
 */
export function lineMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = INK_THRESHOLD,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const limit = threshold * 255 * 255;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const p = i * 4;
      const lightest = Math.min(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!);
      if (rgba[p + 3]! * (255 - lightest) >= limit) mask[i] = 1;
    }
  }
  return mask;
}

/** Neighbour offsets E, NE, N, NW, W, SW, S, SE: the four-neighbours at even places. */
function offsets(width: number): number[] {
  return [1, 1 - width, -width, -1 - width, -1, width - 1, width, width + 1];
}

/**
 * For each arrangement of the eight neighbours (bit k set when neighbour k is
 * line), whether the middle pixel is a simple point: taking it away leaves
 * its neighbours joined up as before (Yokoi's 8-connectivity number is 1).
 */
const SIMPLE = (() => {
  const table = new Uint8Array(256);
  for (let bits = 0; bits < 256; bits += 1) {
    const off = (k: number) => ((bits >> (k % 8)) & 1) === 0;
    let n = 0;
    for (const k of [0, 2, 4, 6]) {
      if (off(k) && !(off(k) && off(k + 1) && off(k + 2))) n += 1;
    }
    table[bits] = n === 1 ? 1 : 0;
  }
  return table;
})();

/** How many of the eight neighbours are set in each arrangement. */
const COUNT = (() => {
  const table = new Uint8Array(256);
  for (let bits = 0; bits < 256; bits += 1) {
    let n = 0;
    for (let k = 0; k < 8; k += 1) n += (bits >> k) & 1;
    table[bits] = n;
  }
  return table;
})();

function neighbourBits(mask: Uint8Array, p: number, off: readonly number[]): number {
  let bits = 0;
  for (let k = 0; k < 8; k += 1) if (mask[p + off[k]!]) bits |= 1 << k;
  return bits;
}

/**
 * Thins a line mask in place to centre lines (Rosenfeld's directional
 * thinning): in turn from the north, south, east and west, every border pixel
 * that is a simple point and not a line end is taken away together, until
 * nothing changes. Lines stay joined up and keep their ends. Only pixels next
 * to one taken away are looked at again, so thick blobs cost little more than
 * thin lines.
 */
export function thin(mask: Uint8Array, width: number): void {
  const off = offsets(width);
  const borders = [-width, width, 1, -1];
  let frontier: number[] = [];
  for (let p = 0; p < mask.length; p += 1) {
    if (mask[p] && (!mask[p - width] || !mask[p + width] || !mask[p + 1] || !mask[p - 1])) {
      frontier.push(p);
    }
  }
  const queued = new Uint8Array(mask.length);
  const removed: number[] = [];
  const batch: number[] = [];
  while (frontier.length > 0) {
    removed.length = 0;
    for (const border of borders) {
      batch.length = 0;
      for (const p of frontier) {
        if (!mask[p] || mask[p + border]) continue;
        const bits = neighbourBits(mask, p, off);
        // A line end (one neighbour) or a lone pixel stays.
        if (COUNT[bits]! < 2 || !SIMPLE[bits]) continue;
        batch.push(p);
      }
      for (const p of batch) {
        mask[p] = 0;
        removed.push(p);
      }
    }
    // Only pixels next to one taken away can have become deletable.
    const next: number[] = [];
    for (const p of removed) {
      for (const d of off) {
        const q = p + d;
        if (mask[q] && !queued[q]) {
          queued[q] = 1;
          next.push(q);
        }
      }
    }
    for (const q of next) queued[q] = 0;
    frontier = next;
  }
}

/** A sheet's centre lines, from its rendered pixels. */
export function traceSheet(rgba: Uint8ClampedArray, width: number, height: number): TraceSheet {
  return traceSheetFromMask(lineMask(rgba, width, height), width, height);
}

/** A sheet's centre lines, from a line mask (which is thinned in place). */
export function traceSheetFromMask(mask: Uint8Array, width: number, height: number): TraceSheet {
  // The outermost pixels stay clear, so neighbours never need bounds checks.
  for (let x = 0; x < width; x += 1) {
    mask[x] = 0;
    mask[(height - 1) * width + x] = 0;
  }
  for (let y = 0; y < height; y += 1) {
    mask[y * width] = 0;
    mask[y * width + width - 1] = 0;
  }
  thin(mask, width);
  let n = 0;
  for (let p = 0; p < mask.length; p += 1) n += mask[p]!;
  const pixels = new Int32Array(n);
  for (let p = 0, i = 0; p < mask.length; p += 1) if (mask[p]) pixels[i++] = p;
  return { width, height, skeleton: mask, pixels };
}

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

/** Where a boundary is on the sheet, in pixels: a disc, or a rectangle along the unit vector (ux, uy). */
export type BarrierShape =
  | { type: 'disc'; cx: number; cy: number; r: number }
  | {
      type: 'box';
      cx: number;
      cy: number;
      ux: number;
      uy: number;
      halfLength: number;
      halfWidth: number;
    };

/** Something the trace stops at: an ESDV, an end flange or a drawing link. */
export interface TraceBarrier {
  id: string;
  shape: BarrierShape;
}

/** How far `p` is from a boundary: 0 on or inside it. */
export function barrierDistance(shape: BarrierShape, p: XY): number {
  if (shape.type === 'disc')
    return Math.max(0, Math.hypot(p.x - shape.cx, p.y - shape.cy) - shape.r);
  const dx = p.x - shape.cx;
  const dy = p.y - shape.cy;
  const along = Math.abs(dx * shape.ux + dy * shape.uy) - shape.halfLength;
  const across = Math.abs(dy * shape.ux - dx * shape.uy) - shape.halfWidth;
  return Math.hypot(Math.max(0, along), Math.max(0, across));
}

function barrierBounds(shape: BarrierShape): { x0: number; y0: number; x1: number; y1: number } {
  if (shape.type === 'disc') {
    return {
      x0: shape.cx - shape.r,
      y0: shape.cy - shape.r,
      x1: shape.cx + shape.r,
      y1: shape.cy + shape.r,
    };
  }
  const ex = Math.abs(shape.ux) * shape.halfLength + Math.abs(shape.uy) * shape.halfWidth;
  const ey = Math.abs(shape.uy) * shape.halfLength + Math.abs(shape.ux) * shape.halfWidth;
  return { x0: shape.cx - ex, y0: shape.cy - ey, x1: shape.cx + ex, y1: shape.cy + ey };
}

// ---------------------------------------------------------------------------
// The graph of the centre lines
// ---------------------------------------------------------------------------

interface Arm {
  edge: number;
  /** Which end of the edge is at the node: 0 its start, 1 its end. */
  end: 0 | 1;
}

interface Node {
  x: number;
  y: number;
  arms: Arm[];
}

interface Edge {
  /** Pixel indices from node `a` to node `b`, both ends included. */
  pixels: number[];
  a: number;
  b: number;
  length: number;
}

/** What one trace covered. */
export interface TraceRegion {
  /** The runs of line traced (graph edges). */
  edges: number[];
  /** Ids of the boundaries and links the trace ran into. */
  reached: string[];
  /** Length of line traced, in pixels. */
  length: number;
}

function runLength(pixels: readonly number[], width: number): number {
  let length = 0;
  for (let i = 1; i < pixels.length; i += 1) {
    const d = Math.abs(pixels[i]! - pixels[i - 1]!);
    length += d === 1 || d === width ? 1 : Math.SQRT2;
  }
  return length;
}

/**
 * The centre lines of a sheet cut at its boundaries, as a graph of junctions
 * and line ends joined by runs of line.
 */
export class TraceGraph {
  readonly width: number;
  readonly height: number;
  readonly barriers: readonly TraceBarrier[];
  private readonly nodes: Node[] = [];
  private readonly edges: Edge[] = [];
  private readonly skeleton: Uint8Array;
  /** The node of each junction and line-end pixel. */
  private readonly nodeOf = new Map<number, number>();
  /** The edge of each pixel along a run. */
  private readonly edgeOf = new Map<number, number>();
  /**
   * The crossings: for each arm into a crossing, the arms that run straight on
   * over it (the arm across, or the bridge and the arm across at its far end).
   */
  private readonly crossings = new Map<number, Map<Arm, Arm[]> | null>();

  constructor(sheet: TraceSheet, barriers: readonly TraceBarrier[]) {
    this.width = sheet.width;
    this.height = sheet.height;
    this.barriers = barriers;
    const skeleton = sheet.skeleton.slice();
    this.skeleton = skeleton;
    const w = this.width;
    // Cut the lines at the boundaries (a pixel wider, so nothing leaks past).
    for (const { shape } of barriers) {
      const box = barrierBounds(shape);
      const x0 = Math.max(0, Math.floor(box.x0 - 1));
      const y0 = Math.max(0, Math.floor(box.y0 - 1));
      const x1 = Math.min(w - 1, Math.ceil(box.x1 + 1));
      const y1 = Math.min(this.height - 1, Math.ceil(box.y1 + 1));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (skeleton[y * w + x] && barrierDistance(shape, { x: x + 0.5, y: y + 0.5 }) <= 1) {
            skeleton[y * w + x] = 0;
          }
        }
      }
    }
    this.build(sheet.pixels);
  }

  private build(all: Int32Array): void {
    const { skeleton, width: w } = this;
    const off = offsets(w);
    const degree = (p: number) => COUNT[neighbourBits(skeleton, p, off)]!;
    const pixels: number[] = [];
    for (const p of all) if (skeleton[p]) pixels.push(p);

    // Nodes: line ends, and clusters of junction pixels.
    const clusters: number[][] = [];
    const clusterOf = new Map<number, number>();
    for (const p of pixels) {
      const d = degree(p);
      if (d === 2 || d === 0 || clusterOf.has(p)) continue;
      const id = clusters.length;
      const cluster = [p];
      clusterOf.set(p, id);
      if (d >= 3) {
        for (let i = 0; i < cluster.length; i += 1) {
          for (const o of off) {
            const q = cluster[i]! + o;
            if (skeleton[q] && !clusterOf.has(q) && degree(q) >= 3) {
              clusterOf.set(q, id);
              cluster.push(q);
            }
          }
        }
      }
      clusters.push(cluster);
    }

    // Edges: runs of line from one node to the next.
    const edges: { pixels: number[]; a: number; b: number }[] = [];
    const direct = new Set<string>();
    const trace = (from: number, first: number, node: number) => {
      const run = [from, first];
      let previous = from;
      let current = first;
      while (!clusterOf.has(current)) {
        let next = -1;
        for (const o of off) {
          const q = current + o;
          if (q !== previous && skeleton[q] && q !== run[run.length - 2]) {
            next = q;
            break;
          }
        }
        if (next < 0) break;
        run.push(next);
        previous = current;
        current = next;
      }
      const id = edges.length;
      for (let i = 1; i < run.length - 1; i += 1) this.edgeOf.set(run[i]!, id);
      edges.push({ pixels: run, a: node, b: clusterOf.get(current) ?? node });
    };
    const start = (cluster: number[], id: number) => {
      for (const p of cluster) {
        for (const o of off) {
          const q = p + o;
          if (!skeleton[q] || this.edgeOf.has(q)) continue;
          const other = clusterOf.get(q);
          if (other === id) continue;
          if (other !== undefined) {
            // Two nodes side by side: an edge with no run between them.
            const key = p < q ? `${p}:${q}` : `${q}:${p}`;
            if (direct.has(key)) continue;
            direct.add(key);
            edges.push({ pixels: [p, q], a: id, b: other });
            continue;
          }
          trace(p, q, id);
        }
      }
    };
    clusters.forEach(start);
    // Closed loops with no junction or end: one of their pixels becomes a node.
    for (const p of pixels) {
      if (clusterOf.has(p) || this.edgeOf.has(p) || degree(p) !== 2) continue;
      const id = clusters.length;
      clusters.push([p]);
      clusterOf.set(p, id);
      start([p], id);
    }

    // Junctions a few pixels apart are one junction: short runs between them go.
    const parent = clusters.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
      return i;
    };
    const isJunction = (c: number) => clusters[c]!.length > 1 || degree(clusters[c]![0]!) >= 3;
    const internal = new Set<number>();
    edges.forEach((edge, i) => {
      if (!isJunction(edge.a) || !isJunction(edge.b)) return;
      const length = runLength(edge.pixels, w);
      // A pixel or two looping back into its own junction is part of it.
      if (edge.a === edge.b) {
        if (length <= 2 * MERGE_DISTANCE) internal.add(i);
        return;
      }
      if (length > MERGE_DISTANCE) return;
      parent[find(edge.a)] = find(edge.b);
      internal.add(i);
    });
    const nodeId = new Map<number, number>();
    const sums: { x: number; y: number; n: number }[] = [];
    clusters.forEach((cluster, i) => {
      const root = find(i);
      let id = nodeId.get(root);
      if (id === undefined) {
        id = sums.length;
        nodeId.set(root, id);
        sums.push({ x: 0, y: 0, n: 0 });
      }
      const sum = sums[id]!;
      for (const p of cluster) {
        const x = p % w;
        sum.x += x + 0.5;
        sum.y += (p - x) / w + 0.5;
        sum.n += 1;
        this.nodeOf.set(p, id);
      }
    });
    for (const sum of sums) this.nodes.push({ x: sum.x / sum.n, y: sum.y / sum.n, arms: [] });
    edges.forEach((edge, i) => {
      if (internal.has(i)) {
        // A run inside a junction is part of it.
        const node = nodeId.get(find(edge.a))!;
        for (const p of edge.pixels) {
          if (this.edgeOf.get(p) === i) this.edgeOf.delete(p);
          if (!this.nodeOf.has(p)) this.nodeOf.set(p, node);
        }
        return;
      }
      const id = this.edges.length;
      const a = nodeId.get(find(edge.a))!;
      const b = nodeId.get(find(edge.b))!;
      this.edges.push({ pixels: edge.pixels, a, b, length: runLength(edge.pixels, w) });
      for (let k = 1; k < edge.pixels.length - 1; k += 1) this.edgeOf.set(edge.pixels[k]!, id);
      this.nodes[a]!.arms.push({ edge: id, end: 0 });
      this.nodes[b]!.arms.push({ edge: id, end: 1 });
    });
  }

  private centre(p: number): XY {
    const x = p % this.width;
    return { x: x + 0.5, y: (p - x) / this.width + 0.5 };
  }

  /** The unit direction an arm leaves its node in. */
  private direction(node: Node, arm: Arm): XY {
    const run = this.edges[arm.edge]!.pixels;
    let p: XY = { x: node.x, y: node.y };
    for (let k = 1; k < run.length; k += 1) {
      p = this.centre(run[arm.end === 0 ? k : run.length - 1 - k]!);
      if (Math.hypot(p.x - node.x, p.y - node.y) >= ARM_LENGTH) break;
    }
    const length = Math.hypot(p.x - node.x, p.y - node.y) || 1;
    return { x: (p.x - node.x) / length, y: (p.y - node.y) / length };
  }

  /**
   * The line an arm runs along, read clear of its junction (whose pixels thin
   * askew): a point on it and its unit direction away from the node.
   */
  private armLine(node: Node, arm: Arm): { p: XY; d: XY } {
    const run = this.edges[arm.edge]!.pixels;
    const at = (k: number) => this.centre(run[arm.end === 0 ? k : run.length - 1 - k]!);
    let near: XY | null = null;
    let far: XY = { x: node.x, y: node.y };
    for (let k = 1; k < run.length; k += 1) {
      far = at(k);
      const distance = Math.hypot(far.x - node.x, far.y - node.y);
      if (!near && distance >= ARM_LENGTH) near = far;
      if (distance >= 2 * ARM_LENGTH) break;
    }
    const from = near && near !== far ? near : { x: node.x, y: node.y };
    const length = Math.hypot(far.x - from.x, far.y - from.y) || 1;
    return { p: far, d: { x: (far.x - from.x) / length, y: (far.y - from.y) / length } };
  }

  /**
   * A crossing: four arms in two straight pairs, as where two lines cross
   * without being joined, at one junction or at two joined by a short bridge.
   * Gives the arms that run straight on from each arm in, or null.
   */
  private crossing(n: number): Map<Arm, Arm[]> | null {
    if (this.crossings.has(n)) return this.crossings.get(n)!;
    this.crossings.set(n, null);
    const node = this.nodes[n]!;
    if (node.arms.length === 4) {
      const dirs = node.arms.map((arm) => this.direction(node, arm));
      const across = dirs.map((d, i) => {
        let best = -1;
        let bestDot = Infinity;
        dirs.forEach((e, j) => {
          const dot = d.x * e.x + d.y * e.y;
          if (j !== i && dot < bestDot) {
            best = j;
            bestDot = dot;
          }
        });
        return { j: best, dot: bestDot };
      });
      if (across.every(({ j, dot }, i) => across[j]!.j === i && dot <= STRAIGHT)) {
        this.crossings.set(
          n,
          new Map(node.arms.map((arm, i) => [arm, [node.arms[across[i]!.j]!]])),
        );
      }
    } else if (node.arms.length === 3) {
      for (const bridge of node.arms) {
        const edge = this.edges[bridge.edge]!;
        const m = this.nodeAt(edge, bridge.end === 0 ? 1 : 0);
        const other = this.nodes[m]!;
        if (m === n || other.arms.length !== 3 || edge.length > CROSSING_BRIDGE) continue;
        const back = other.arms.find((a) => a.edge === bridge.edge && a !== bridge)!;
        const pairs = this.bridged(node, bridge, other, back);
        if (!pairs) continue;
        const here = new Map<Arm, Arm[]>();
        const there = new Map<Arm, Arm[]>();
        for (const [a, b] of pairs) {
          here.set(a, [bridge, b]);
          there.set(b, [back, a]);
        }
        this.crossings.set(n, here);
        this.crossings.set(m, there);
        break;
      }
    }
    return this.crossings.get(n)!;
  }

  /**
   * Whether two tees joined by a bridge are two lines crossing at a slant:
   * each arm of one tee runs straight on into an arm of the other, along the
   * bridge. Gives the pairs, or null.
   */
  private bridged(n: Node, bridge: Arm, m: Node, back: Arm): [Arm, Arm][] | null {
    const outer = (node: Node, skip: Arm) =>
      node.arms.filter((a) => a !== skip).map((arm) => ({ arm, ...this.armLine(node, arm) }));
    const [a1, a2] = outer(n, bridge);
    const [b1, b2] = outer(m, back);
    if (!a1 || !a2 || !b1 || !b2) return null;
    /** How far `p` is from the line through `q` along `d`. */
    const off = (p: XY, q: XY, d: XY) => Math.abs((p.x - q.x) * d.y - (p.y - q.y) * d.x);
    type Line = { p: XY; d: XY };
    const straight = (a: Line, b: Line) =>
      a.d.x * b.d.x + a.d.y * b.d.y <= STRAIGHT &&
      // Away from the bridge on each side, in one line through both tees.
      a.d.x * (m.x - n.x) + a.d.y * (m.y - n.y) < 0 &&
      b.d.x * (n.x - m.x) + b.d.y * (n.y - m.y) < 0 &&
      off(b.p, a.p, a.d) <= COLLINEAR &&
      off(a.p, b.p, b.d) <= COLLINEAR;
    if (straight(a1, b1) && straight(a2, b2)) {
      return [
        [a1.arm, b1.arm],
        [a2.arm, b2.arm],
      ];
    }
    if (straight(a1, b2) && straight(a2, b1)) {
      return [
        [a1.arm, b2.arm],
        [a2.arm, b1.arm],
      ];
    }
    return null;
  }

  private nodeAt(edge: Edge, end: 0 | 1): number {
    return end === 0 ? edge.a : edge.b;
  }

  /** Line ends within `reach` pixels of each boundary: the pipes that leave it. */
  edgesAt(barrierId: string, reach = REACH): number[] {
    const barrier = this.barriers.find((b) => b.id === barrierId);
    if (!barrier) return [];
    const box = barrierBounds(barrier.shape);
    const out: number[] = [];
    for (const node of this.nodes) {
      if (node.arms.length !== 1) continue;
      if (node.x < box.x0 - reach - 1 || node.x > box.x1 + reach + 1) continue;
      if (node.y < box.y0 - reach - 1 || node.y > box.y1 + reach + 1) continue;
      if (barrierDistance(barrier.shape, node) <= reach) out.push(node.arms[0]!.edge);
    }
    return out;
  }

  /** The runs of line nearest to `p`, within `radius` pixels: one, or all the arms of a junction. */
  edgesNear(p: XY, radius: number): number[] {
    const r = Math.ceil(radius);
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    let best = -1;
    let bestDistance = radius * radius;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.height - 1, cy + r); y += 1) {
      for (let x = Math.max(0, cx - r); x <= Math.min(this.width - 1, cx + r); x += 1) {
        const q = y * this.width + x;
        if (!this.skeleton[q]) continue;
        const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
        if (d <= bestDistance) {
          best = q;
          bestDistance = d;
        }
      }
    }
    if (best < 0) return [];
    const edge = this.edgeOf.get(best);
    if (edge !== undefined) return [edge];
    const node = this.nodeOf.get(best);
    return node === undefined ? [] : this.nodes[node]!.arms.map((arm) => arm.edge);
  }

  /**
   * Traces the line work from the runs `seeds`, both ways, until it ends: at a
   * boundary, at a link, or where the line does. Every branch of a tee is
   * taken; a crossing is run straight over.
   */
  trace(seeds: readonly number[]): TraceRegion {
    const visited = new Set<number>();
    const queue: [number, 0 | 1][] = [];
    for (const seed of seeds) {
      if (seed < 0 || seed >= this.edges.length || visited.has(seed)) continue;
      visited.add(seed);
      queue.push([seed, 0], [seed, 1]);
    }
    const ends = new Set<number>();
    while (queue.length > 0) {
      const [e, end] = queue.pop()!;
      const n = this.nodeAt(this.edges[e]!, end);
      const node = this.nodes[n]!;
      if (node.arms.length <= 1) {
        ends.add(n);
        continue;
      }
      const from = node.arms.find((arm) => arm.edge === e && arm.end === end)!;
      const straight = this.crossing(n)?.get(from);
      // Over a bridged crossing, the bridge is traced on the way.
      for (const arm of straight?.slice(0, -1) ?? []) visited.add(arm.edge);
      const next = straight ? straight.slice(-1) : node.arms.filter((arm) => arm !== from);
      for (const arm of next) {
        if (visited.has(arm.edge)) continue;
        visited.add(arm.edge);
        queue.push([arm.edge, arm.end === 0 ? 1 : 0]);
      }
    }
    const reached = new Set<string>();
    for (const n of ends) {
      const node = this.nodes[n]!;
      for (const barrier of this.barriers) {
        if (barrierDistance(barrier.shape, node) <= REACH) reached.add(barrier.id);
      }
    }
    const edges = [...visited];
    return {
      edges,
      reached: [...reached],
      length: edges.reduce((sum, e) => sum + this.edges[e]!.length, 0),
    };
  }

  /**
   * The line a trace covered as paths for highlighter strokes, in pixels:
   * runs joined through junctions into as few paths as it takes, keeping
   * straight on where it can. Stubs shorter than `spur` pixels off a junction
   * (letters touching a line, the fuzz of thinning) are left out, since the pen
   * covers them anyway. Points within `tolerance` of a straight line are
   * dropped.
   */
  paths(region: TraceRegion, spur = 0, tolerance = 0.75): XY[][] {
    const endAtBarrier = (n: number) => {
      const node = this.nodes[n]!;
      return this.barriers.some((b) => barrierDistance(b.shape, node) <= REACH);
    };
    const isSpur = (e: number) => {
      const edge = this.edges[e]!;
      if (edge.length >= spur) return false;
      const a = this.nodes[edge.a]!.arms.length;
      const b = this.nodes[edge.b]!.arms.length;
      return (
        (a === 1 && b >= 3 && !endAtBarrier(edge.a)) || (b === 1 && a >= 3 && !endAtBarrier(edge.b))
      );
    };
    const keep = new Set(region.edges.filter((e) => !isSpur(e)));
    const used = new Set<number>();
    // Paths start at line ends where there are any, so they run end to end.
    const order = [...keep].sort((x, y) => {
      const ends = (e: number) => {
        const edge = this.edges[e]!;
        return (
          Number(this.nodes[edge.a]!.arms.length === 1) +
          Number(this.nodes[edge.b]!.arms.length === 1)
        );
      };
      return ends(y) - ends(x);
    });

    /** The run of the next edge on from node `n`, arrived at along `arm`. */
    /** The arms on from node `n`, reached along `arm`: the last is the run to follow. */
    const onward = (n: number, arm: Arm): Arm[] | null => {
      const straight = this.crossing(n)?.get(arm);
      if (straight) {
        const last = straight[straight.length - 1]!;
        return keep.has(last.edge) && !used.has(last.edge) ? straight : null;
      }
      const node = this.nodes[n]!;
      const open = node.arms.filter((a) => a !== arm && keep.has(a.edge) && !used.has(a.edge));
      if (open.length === 0) return null;
      const d = this.direction(node, arm);
      let best = open[0]!;
      let bestDot = Infinity;
      for (const a of open) {
        const e = this.direction(node, a);
        const dot = d.x * e.x + d.y * e.y;
        if (dot < bestDot) {
          best = a;
          bestDot = dot;
        }
      }
      return [best];
    };

    /** Follows runs on from the end of `run` at node `n`, reached along `arm`. */
    const extend = (run: number[], n: number, arm: Arm) => {
      for (;;) {
        const route = onward(n, arm);
        if (!route) return;
        for (const next of route) {
          const edge = this.edges[next.edge]!;
          // A bridge both lines run over is drawn once.
          if (!used.has(next.edge) && keep.has(next.edge)) {
            used.add(next.edge);
            const pixels = next.end === 0 ? edge.pixels : [...edge.pixels].reverse();
            run.push(...pixels.slice(run[run.length - 1] === pixels[0] ? 1 : 0));
          }
          const end = next.end === 0 ? 1 : 0;
          n = this.nodeAt(edge, end);
          arm = this.nodes[n]!.arms.find((a) => a.edge === next.edge && a.end === end)!;
        }
      }
    };

    const out: XY[][] = [];
    for (const e of order) {
      if (used.has(e)) continue;
      used.add(e);
      const edge = this.edges[e]!;
      const run = [...edge.pixels];
      extend(
        run,
        edge.b,
        this.nodes[edge.b]!.arms.find((a) => a.edge === e && a.end === 1)!,
      );
      const back = [...run].reverse();
      extend(
        back,
        edge.a,
        this.nodes[edge.a]!.arms.find((a) => a.edge === e && a.end === 0)!,
      );
      const points = back.map((p) => this.centre(p));
      out.push(simplifyPath(points, tolerance));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Tracing a segment from its own boundaries
// ---------------------------------------------------------------------------

/** A boundary and the segments either side of it. */
export interface BoundarySides {
  id: string;
  /**
   * An ESDV's upstream and downstream segments, or an end flange's segment
   * and its outside (null). Null sides are unknown, so they match nothing.
   */
  sides: readonly (string | null)[];
  /** An end flange: one side is its segment, the other the drain or flare it goes to. */
  endFlange?: boolean;
}

/** The outside of every end flange: the drain or flare system, in no segment. */
const OUTSIDE = '\u0000outside';

export interface SegmentTrace {
  /** The line that belongs to the segment. */
  regions: TraceRegion[];
  /** Line next to the segment's boundaries that may or may not be the segment's. */
  undecided: TraceRegion[];
}

/**
 * Traces a segment from its own boundaries on a drawing: from each pipe that
 * leaves one of its ESDVs or end flanges, along the line work until it runs
 * into boundaries. The line belongs to the segment when every boundary it ran
 * into has the segment on one side and no other segment is common to them
 * all. Otherwise it is decided by elimination: next to a boundary of the
 * segment, once one side is the segment's the other sides are not, and when
 * every other side is known not to be the segment's, the last one is. What is
 * left is undecided, and runs shorter than `minLength` pixels (bits of a valve
 * symbol sticking out of an ESDV's ring) are dropped.
 */
export function traceSegment(
  graph: TraceGraph,
  segmentId: string,
  boundaries: readonly BoundarySides[],
  minLength = 0,
): SegmentTrace {
  const sidesOf = new Map(
    boundaries.map((b) => [
      b.id,
      new Set(
        b.endFlange
          ? [b.sides[0] ?? `?${b.id}`, OUTSIDE]
          : b.sides.map((side, i) => side ?? `?${b.id}:${i}`),
      ),
    ]),
  );
  const own = boundaries.filter((b) => b.sides.includes(segmentId));
  const regions: TraceRegion[] = [];
  const regionOf = new Map<number, number>();
  for (const boundary of own) {
    for (const edge of graph.edgesAt(boundary.id)) {
      if (regionOf.has(edge)) continue;
      const region = graph.trace([edge]);
      for (const e of region.edges) regionOf.set(e, regions.length);
      regions.push(region);
    }
  }

  type Verdict = 'yes' | 'no' | 'maybe';
  const verdicts: Verdict[] = regions.map((region) => {
    let common = null as Set<string> | null;
    for (const id of region.reached) {
      const sides = sidesOf.get(id);
      if (!sides) continue; // A drawing link says nothing about the segment.
      common = new Set(common ? [...common].filter((s) => sides.has(s)) : sides);
    }
    if (!common?.has(segmentId)) return 'no';
    return common.size === 1 ? 'yes' : 'maybe';
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const boundary of own) {
      const here = regions.flatMap((r, i) => (r.reached.includes(boundary.id) ? [i] : []));
      const yes = here.some((i) => verdicts[i] === 'yes');
      const maybe = here.filter((i) => verdicts[i] === 'maybe');
      for (const i of maybe) {
        if (yes) {
          verdicts[i] = 'no';
          changed = true;
        }
      }
      if (!yes && maybe.length === 1 && here.some((i) => verdicts[i] === 'no')) {
        verdicts[maybe[0]!] = 'yes';
        changed = true;
      }
    }
  }
  return {
    regions: regions.filter((_, i) => verdicts[i] === 'yes'),
    undecided: regions.filter((r, i) => verdicts[i] === 'maybe' && r.length >= minLength),
  };
}
