/**
 * Line sizes on the rendered sheet (CNT-01): which line number or size label
 * gives the size of the pipe a symbol sits on.
 *
 * 1. Each size label (domain/line-labels.ts) is pinned to the pipe it is
 *    written along: the nearest straight run of line beside it that runs the
 *    same way as the text, within about one and a half text heights.
 * 2. From a symbol, the pipe is followed each way along the one line, on the
 *    centre lines of the auto trace (auto-trace.ts): straight on over
 *    crossings and along the run of a tee, across the symbols on the line
 *    (valves, flanges, ESDVs, instruments) and small gaps in the line work.
 *    It does not turn into a branch or out of the stem of a tee into the run,
 *    since those are other lines, nor go through a vessel, pump or other
 *    equipment, where lines of other sizes meet.
 * 3. The first label met each way gives that side's size. One size all round
 *    sizes the symbol. No label, or sizes that differ (a symbol beside a
 *    reducer), leave the size to the user. A size written on its own close by
 *    (a 2" valve on a 6" line) wins over the line numbers further off.
 *
 * Everything here is in the pixels of the rendered sheet.
 */
import type { SizeLabel } from '../line-labels';
import type { NominalSize } from '../sizes';
import { barrierDistance, type Arm, type BarrierShape, type TraceGraph } from './auto-trace';
import type { XY } from './geometry';

/** A size label, its box in the pixels of the sheet. */
export type PlacedSizeLabel = SizeLabel;

export type LineSizeReading =
  /** One size: from `label`, the nearest label that gives it. */
  | { status: 'found'; size: NominalSize; label: PlacedSizeLabel }
  /** Labels that disagree: the symbol may sit where the size changes. */
  | { status: 'conflict'; labels: PlacedSizeLabel[] }
  /** No label on the symbol's line. */
  | { status: 'none' };

export interface LineSizeOptions {
  /** Ids of the barriers the line runs on through: valves, flanges, ESDVs, suggestions. */
  inline: ReadonlySet<string>;
  /**
   * Ids of the symbols that take only a size written beside them, not their
   * line's: small-bore connections and instruments, and equipment.
   */
  ownOnly?: ReadonlySet<string>;
  /** Breaks in the line work up to this long (px) are jumped; by default 1.5 text heights. */
  gap?: number;
}

/** A line end this near (px) to a symbol leaves it (as the auto trace's reach). */
const REACH = 3;
/** Labels are pinned to pipe within this many text heights of them. */
const LABEL_REACH = 1.6;
/** …that runs straight for at least this many text heights (longer than any letter). */
const LABEL_RUN = 2;
/** A size written alone counts as the symbol's own within this many symbol radii. */
const OWN_SIZE_REACH = 3;
/** Breaks in the line work up to this many text heights long are jumped (a line broken where another crosses it). */
const GAP = 1.5;
/** The line carries on beyond a symbol or gap within this angle of straight on. */
const ON_LINE = Math.cos((35 * Math.PI) / 180);

const sameSize = (a: NominalSize, b: NominalSize) => a.value === b.value && a.unit === b.unit;

/** A barrier's size: the radius of a circle round it. */
function radiusOf(shape: BarrierShape): number {
  return shape.type === 'disc' ? shape.r : Math.hypot(shape.halfLength, shape.halfWidth);
}

function centreOf(shape: BarrierShape): XY {
  return { x: shape.cx, y: shape.cy };
}

// ---------------------------------------------------------------------------
// Pinning labels to the pipe they are written along
// ---------------------------------------------------------------------------

interface Pin {
  label: PlacedSizeLabel;
  /** Where along the run's pixels the label sits. */
  index: number;
}

/**
 * How far the centre line runs straight from (x, y), across the sheet or up
 * it, up to `limit` pixels: it may step a pixel aside now and then (a line
 * drawn a hair off straight), but not drift away.
 */
function straightRun(graph: TraceGraph, x: number, y: number, across: boolean, limit: number) {
  const { width, height } = graph;
  let run = 1;
  for (const step of [-1, 1]) {
    let cx = x;
    let cy = y;
    for (let k = 1; run < limit; k += 1) {
      let found = false;
      for (const aside of [0, -1, 1]) {
        const qx = across ? cx + step : cx + aside;
        const qy = across ? cy + aside : cy + step;
        if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
        const drift = across ? Math.abs(qy - y) : Math.abs(qx - x);
        if (drift > 2 + 0.05 * k || !graph.isLine(qy * width + qx)) continue;
        cx = qx;
        cy = qy;
        found = true;
        break;
      }
      if (!found) break;
      run += 1;
    }
  }
  return run;
}

/** The run of pipe a label is written along, and where along it. */
function pinLabel(
  graph: TraceGraph,
  label: PlacedSizeLabel,
): { edge: number; pixel: number } | null {
  const across = !label.vertical;
  const textHeight = Math.max(1, across ? label.height : label.width);
  const reach = LABEL_REACH * textHeight + 2;
  const minRun = LABEL_RUN * textHeight;
  // Along: the way the text runs; out: away from it either side.
  const along0 = across ? label.x : label.y;
  const along1 = across ? label.x + label.width : label.y + label.height;
  const side0 = across ? label.y : label.x;
  const side1 = across ? label.y + label.height : label.x + label.width;
  const middle = (along0 + along1) / 2;
  let best: { edge: number; pixel: number } | null = null;
  let bestGap = Infinity;
  let bestOffset = Infinity;
  const a0 = Math.max(1, Math.floor(along0));
  const a1 = Math.min((across ? graph.width : graph.height) - 2, Math.ceil(along1));
  const s0 = Math.max(1, Math.floor(side0 - reach));
  const s1 = Math.min((across ? graph.height : graph.width) - 2, Math.ceil(side1 + reach));
  for (let s = s0; s <= s1; s += 1) {
    const c = s + 0.5;
    // Pipe inside the text's own box is its letters.
    const gap = c < side0 ? side0 - c : c > side1 ? c - side1 : -1;
    if (gap < 0 || gap > bestGap) continue;
    for (let a = a0; a <= a1; a += 1) {
      const x = across ? a : s;
      const y = across ? s : a;
      const p = y * graph.width + x;
      if (!graph.isLine(p)) continue;
      const edge = graph.edgeAt(p);
      if (edge === undefined) continue;
      const offset = Math.abs(a + 0.5 - middle);
      if (gap === bestGap && offset >= bestOffset) continue;
      if (straightRun(graph, x, y, across, minRun) < minRun) continue;
      best = { edge, pixel: p };
      bestGap = gap;
      bestOffset = offset;
    }
  }
  return best;
}

function pinLabels(graph: TraceGraph, labels: readonly PlacedSizeLabel[]): Map<number, Pin[]> {
  const pins = new Map<number, Pin[]>();
  for (const label of labels) {
    const at = pinLabel(graph, label);
    if (!at) continue;
    const index = graph.edge(at.edge).pixels.indexOf(at.pixel);
    const list = pins.get(at.edge) ?? [];
    list.push({ label, index });
    pins.set(at.edge, list);
  }
  return pins;
}

// ---------------------------------------------------------------------------
// Following the line from a symbol
// ---------------------------------------------------------------------------

interface Hit {
  label: PlacedSizeLabel;
  /** How far along the line from the symbol (px). */
  distance: number;
}

/** Line ends in cells of the sheet, to find those near a point quickly. */
class EndIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly graph: TraceGraph;
  private static readonly CELL = 64;

  constructor(graph: TraceGraph) {
    this.graph = graph;
    for (const n of graph.lineEnds()) {
      const { x, y } = graph.node(n);
      const key = this.key(Math.floor(x / EndIndex.CELL), Math.floor(y / EndIndex.CELL));
      const list = this.cells.get(key) ?? [];
      list.push(n);
      this.cells.set(key, list);
    }
  }

  private key(cx: number, cy: number): number {
    return cy * 100_000 + cx;
  }

  /** Line ends within `radius` of `p`. */
  near(p: XY, radius: number): number[] {
    const out: number[] = [];
    const size = EndIndex.CELL;
    for (
      let cy = Math.floor((p.y - radius) / size);
      cy <= Math.floor((p.y + radius) / size);
      cy++
    ) {
      for (
        let cx = Math.floor((p.x - radius) / size);
        cx <= Math.floor((p.x + radius) / size);
        cx++
      ) {
        for (const n of this.cells.get(this.key(cx, cy)) ?? []) {
          const node = this.graph.node(n);
          if (Math.hypot(node.x - p.x, node.y - p.y) <= radius) out.push(n);
        }
      }
    }
    return out;
  }
}

class LineWalker {
  private readonly graph: TraceGraph;
  private readonly inline: ReadonlySet<string>;
  private readonly pins: Map<number, Pin[]>;
  private readonly ends: EndIndex;
  private readonly gap: number;

  constructor(
    graph: TraceGraph,
    labels: readonly PlacedSizeLabel[],
    inline: ReadonlySet<string>,
    gap: number,
  ) {
    this.graph = graph;
    this.inline = inline;
    this.pins = pinLabels(graph, labels);
    this.ends = new EndIndex(graph);
    this.gap = gap;
  }

  /** The barriers within reach of `p`. */
  private touching(p: XY) {
    return this.graph.barriers.filter((b) => barrierDistance(b.shape, p) <= REACH + 1);
  }

  /** `from` and the barriers that overlap it, and those that overlap them in turn. */
  cluster(from: readonly string[]) {
    const all = this.graph.barriers;
    const ids = new Set(from);
    const out = all.filter((b) => ids.has(b.id));
    for (let i = 0; i < out.length; i += 1) {
      const a = out[i]!;
      for (const b of all) {
        if (ids.has(b.id)) continue;
        const apart = Math.hypot(a.shape.cx - b.shape.cx, a.shape.cy - b.shape.cy);
        if (apart <= radiusOf(a.shape) + radiusOf(b.shape) + 2 * REACH) {
          ids.add(b.id);
          out.push(b);
        }
      }
    }
    return out;
  }

  /** The line ends that leave a group of symbols. */
  endsAround(group: readonly { shape: BarrierShape }[]): number[] {
    const out = new Set<number>();
    for (const { shape } of group) {
      for (const n of this.ends.near(centreOf(shape), radiusOf(shape) + REACH + 2)) {
        if (barrierDistance(shape, this.graph.node(n)) <= REACH + 1) out.add(n);
      }
    }
    return [...out];
  }

  /**
   * Where the line carries on past a line end it arrives at going `d`: across
   * the symbols there (none of them equipment the line ends at), or across a
   * gap in the line work. Gives the line end it carries on from, or null.
   */
  private jump(n: number, d: XY): { node: number; gap: number } | null {
    const p = this.graph.node(n);
    const touching = this.touching(p);
    const group = touching.length ? this.cluster(touching.map((b) => b.id)) : [];
    if (group.some((b) => !this.inline.has(b.id))) return null;
    let limit = this.gap;
    for (const { shape } of group) {
      const ahead = (shape.cx - p.x) * d.x + (shape.cy - p.y) * d.y + radiusOf(shape);
      limit = Math.max(limit, ahead + REACH + 2);
    }
    let best: { node: number; gap: number; off: number } | null = null;
    for (const m of this.ends.near(p, limit)) {
      if (m === n) continue;
      const q = this.graph.node(m);
      const vx = q.x - p.x;
      const vy = q.y - p.y;
      const along = vx * d.x + vy * d.y;
      const off = Math.abs(vx * d.y - vy * d.x);
      if (along <= 0 || along > limit || off > Math.max(2, 0.25 * along)) continue;
      // Leaving a symbol, the line starts at its edge; across a gap, anywhere ahead.
      if (group.length && !group.some((b) => barrierDistance(b.shape, q) <= REACH + 1)) continue;
      const out = this.graph.armDirection(m, q.arms[0]!);
      if (out.x * d.x + out.y * d.y < ON_LINE) continue;
      if (!best || along < best.gap || (along === best.gap && off < best.off)) {
        best = { node: m, gap: along, off };
      }
    }
    return best ? { node: best.node, gap: best.gap } : null;
  }

  /**
   * The pipe running nearest `p`, within `radius`: a pixel of line that runs
   * straight across or up the sheet for at least `minLength` (a pipe, not a
   * stroke of a symbol), and where along its run of the graph it is.
   */
  runNear(p: XY, radius: number, minLength: number): { edge: number; index: number } | null {
    const graph = this.graph;
    let best: { edge: number; pixel: number } | null = null;
    let bestDistance = radius * radius;
    const x0 = Math.max(0, Math.floor(p.x - radius));
    const x1 = Math.min(graph.width - 1, Math.ceil(p.x + radius));
    const y0 = Math.max(0, Math.floor(p.y - radius));
    const y1 = Math.min(graph.height - 1, Math.ceil(p.y + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const pixel = y * graph.width + x;
        const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
        if (d > bestDistance || !graph.isLine(pixel)) continue;
        const edge = graph.edgeAt(pixel);
        if (edge === undefined) continue;
        const straight = Math.max(
          straightRun(graph, x, y, true, minLength),
          straightRun(graph, x, y, false, minLength),
        );
        if (straight < minLength) continue;
        best = { edge, pixel };
        bestDistance = d;
      }
    }
    return best
      ? { edge: best.edge, index: graph.edge(best.edge).pixels.indexOf(best.pixel) }
      : null;
  }

  /** Follows the line from line end `start` until it meets a label or ends. */
  walkFrom(start: number): Hit | null {
    return this.walk(this.graph.node(start).arms[0]!, 0);
  }

  /**
   * Follows the line along `arm`, from `skip` pixels into its first run,
   * until it meets a label or ends.
   */
  walk(first: Arm, skip: number): Hit | null {
    const graph = this.graph;
    const visited = new Set<number>();
    let arm = first;
    let from = skip;
    let distance = 0;
    for (;;) {
      if (visited.has(arm.edge)) return null;
      visited.add(arm.edge);
      const edge = graph.edge(arm.edge);
      const step = edge.length / Math.max(1, edge.pixels.length - 1);
      let best: Hit | null = null;
      for (const pin of this.pins.get(arm.edge) ?? []) {
        const k = arm.end === 0 ? pin.index : edge.pixels.length - 1 - pin.index;
        if (k < from) continue;
        const at = distance + (k - from) * step;
        if (!best || at < best.distance) best = { label: pin.label, distance: at };
      }
      if (best) return best;
      distance += edge.length - from * step;
      from = 0;
      const end = arm.end === 0 ? 1 : 0;
      const n = end === 0 ? edge.a : edge.b;
      const node = graph.node(n);
      const arrived = node.arms.find((a) => a.edge === arm.edge && a.end === end)!;
      if (node.arms.length === 1) {
        const back = graph.armDirection(n, arrived);
        const on = this.jump(n, { x: -back.x, y: -back.y });
        if (!on) return null;
        distance += on.gap;
        arm = graph.node(on.node).arms[0]!;
        continue;
      }
      const on = graph.straightOn(n, arrived);
      if (!on) return null;
      for (const bridge of on.slice(0, -1)) {
        visited.add(bridge.edge);
        distance += graph.edge(bridge.edge).length;
      }
      arm = on[on.length - 1]!;
    }
  }
}

/** The labels' sizes, nearest first, if they all agree; else null. */
function agreed(hits: readonly Hit[]): Hit | null {
  const sorted = [...hits].sort((a, b) => a.distance - b.distance);
  const [first] = sorted;
  return first && sorted.every((h) => sameSize(h.label.size, first.label.size)) ? first : null;
}

function reading(hits: readonly Hit[]): LineSizeReading {
  if (hits.length === 0) return { status: 'none' };
  const one = agreed(hits);
  if (one) return { status: 'found', size: one.label.size, label: one.label };
  const labels: PlacedSizeLabel[] = [];
  for (const h of [...hits].sort((a, b) => a.distance - b.distance)) {
    if (!labels.some((l) => sameSize(l.size, h.label.size))) labels.push(h.label);
  }
  return { status: 'conflict', labels };
}

/** How far a point is from a label's box (0 inside it). */
function boxDistance(label: PlacedSizeLabel, p: XY): number {
  const dx = Math.max(label.x - p.x, 0, p.x - (label.x + label.width));
  const dy = Math.max(label.y - p.y, 0, p.y - (label.y + label.height));
  return Math.hypot(dx, dy);
}

/** The median text height of the labels, for the gaps the walk jumps. */
function textHeight(labels: readonly PlacedSizeLabel[]): number {
  const heights = labels.map((l) => (l.vertical ? l.width : l.height)).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] ?? 0;
}

/**
 * The line size of each symbol in `symbolIds`, which are barriers of
 * `graph` (so its own line work is cut out of the line it sits on).
 */
export function readLineSizes(
  graph: TraceGraph,
  labels: readonly PlacedSizeLabel[],
  symbolIds: readonly string[],
  options: LineSizeOptions,
): Map<string, LineSizeReading> {
  const out = new Map<string, LineSizeReading>();
  if (labels.length === 0) {
    for (const id of symbolIds) out.set(id, { status: 'none' });
    return out;
  }
  const walker = new LineWalker(
    graph,
    labels,
    options.inline,
    options.gap ?? Math.max(4, GAP * textHeight(labels)),
  );
  const own = labels.filter((l) => l.kind === 'size');
  for (const id of symbolIds) {
    const symbol = graph.barriers.find((b) => b.id === id);
    if (!symbol) {
      out.set(id, { status: 'none' });
      continue;
    }
    const r = radiusOf(symbol.shape);
    // A symbol overlapping its neighbours on the line is left by their line ends too.
    const group = walker.cluster([id]).filter((b) => b.id === id || options.inline.has(b.id));
    let hits = walker
      .endsAround(group)
      .map((n) => walker.walkFrom(n))
      .filter((h): h is Hit => h !== null);
    if (hits.length === 0) {
      // A ring that does not cut the pipe (drawn off centre, or round a symbol
      // beside the line): the pipe nearest its centre, both ways.
      const run = walker.runNear(centreOf(symbol.shape), r + REACH, 2 * r);
      if (run) {
        const length = graph.edge(run.edge).pixels.length;
        hits = [
          walker.walk({ edge: run.edge, end: 0 }, run.index),
          walker.walk({ edge: run.edge, end: 1 }, length - 1 - run.index),
        ].filter((h): h is Hit => h !== null);
      }
    }
    // A size written alone close by is the symbol's own.
    const close = hits.filter((h) => h.label.kind === 'size' && h.distance <= OWN_SIZE_REACH * r);
    if (close.length) {
      out.set(id, reading(close));
      continue;
    }
    if (hits.length && !options.ownOnly?.has(id)) {
      out.set(id, reading(hits));
      continue;
    }
    // Off the line work altogether: a size written beside the symbol.
    const centre = centreOf(symbol.shape);
    const beside = own
      .filter((l) => boxDistance(l, centre) <= OWN_SIZE_REACH * r)
      .map((label) => ({ label, distance: boxDistance(label, centre) }));
    out.set(id, reading(beside));
  }
  return out;
}
