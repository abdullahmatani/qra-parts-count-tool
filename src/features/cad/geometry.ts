/**
 * Curve tessellation for CAD entities. Tolerances are chord errors in world
 * units (the caller converts from drawing units).
 */
import type { CadVertex, Vec2 } from './model';

const TAU = Math.PI * 2;
const MAX_SEGMENTS = 720;

/** Number of segments so that the chord error of a circle of radius r is at most tol. */
export function segmentsFor(radius: number, sweep: number, tolerance: number): number {
  if (!(radius > 0) || !(sweep > 0)) return 1;
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)));
  const n = Math.ceil(sweep / (step > 1e-6 ? step : 1e-6));
  return Math.max(2, Math.min(MAX_SEGMENTS, n, Math.ceil((sweep / TAU) * MAX_SEGMENTS)));
}

/** Points on a circular arc from start to end angle (radians, counter-clockwise). */
export function arcPoints(
  center: Vec2,
  radius: number,
  start: number,
  end: number,
  tolerance: number,
): Vec2[] {
  let sweep = end - start;
  while (sweep <= 0) sweep += TAU;
  if (sweep > TAU) sweep = TAU;
  const n = segmentsFor(radius, sweep, tolerance);
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = start + (sweep * i) / n;
    points.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return points;
}

export function circlePoints(center: Vec2, radius: number, tolerance: number): Vec2[] {
  return arcPoints(center, radius, 0, TAU, tolerance);
}

/**
 * Intermediate points of a bulged polyline segment from p0 to p1 (excluding
 * p0, including p1). bulge = tan(θ/4); positive is counter-clockwise.
 */
export function bulgePoints(p0: Vec2, p1: Vec2, bulge: number, tolerance: number): Vec2[] {
  if (!bulge || Math.abs(bulge) < 1e-9) return [p1];
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return [p1];
  const theta = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
  // Centre: from the chord midpoint along the normal.
  const mx = (p0[0] + p1[0]) / 2;
  const my = (p0[1] + p1[1]) / 2;
  const sagittaToCentre = radius * Math.cos(theta / 2) * Math.sign(bulge);
  const nx = -dy / chord;
  const ny = dx / chord;
  const cx = mx + nx * sagittaToCentre;
  const cy = my + ny * sagittaToCentre;
  const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
  const n = segmentsFor(radius, Math.abs(theta), tolerance);
  const points: Vec2[] = [];
  for (let i = 1; i <= n; i += 1) {
    const a = a0 + (theta * i) / n;
    points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  points[points.length - 1] = p1;
  return points;
}

/** Flattens polyline vertices with bulges into points. */
export function polylinePoints(
  vertices: readonly CadVertex[],
  closed: boolean,
  tolerance: number,
): Vec2[] {
  if (vertices.length === 0) return [];
  const points: Vec2[] = [[vertices[0]!.x, vertices[0]!.y]];
  const count = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < count; i += 1) {
    const v0 = vertices[i]!;
    const v1 = vertices[(i + 1) % vertices.length]!;
    points.push(...bulgePoints([v0.x, v0.y], [v1.x, v1.y], v0.bulge, tolerance));
  }
  return points;
}

/** Whether any segment of a polyline has a width (start or end). */
export function hasPolylineWidth(vertices: readonly CadVertex[]): boolean {
  return vertices.some((v) => (v.startWidth ?? 0) > 0 || (v.endWidth ?? 0) > 0);
}

export interface WidePolyline {
  /** Filled outlines: one per wide segment, plus one per mitred join between them. */
  shapes: Vec2[][];
  /** Centre lines of the runs of segments no wider than `minWidth`, drawn as lines. */
  runs: Vec2[][];
}

/** A wide segment: its centre-line points, end tangents and half widths. */
interface Band {
  points: Vec2[];
  startTangent: Vec2;
  endTangent: Vec2;
  startHalf: number;
  endHalf: number;
}

const unit = (x: number, y: number): Vec2 => {
  const length = Math.hypot(x, y);
  return length > 0 ? [x / length, y / length] : [1, 0];
};

const turn = ([x, y]: Vec2, angle: number): Vec2 => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
};

/** The outline of one segment whose width runs linearly from start to end. */
function bandOutline(points: Vec2[], bulge: number, startHalf: number, endHalf: number): Band {
  const last = points.length - 1;
  const lengths = [0];
  for (let k = 1; k <= last; k += 1) {
    const [x0, y0] = points[k - 1]!;
    const [x1, y1] = points[k]!;
    lengths.push(lengths[k - 1]! + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = lengths[last]!;
  // An arc is split into equal steps, so the tangent at an inner point is
  // parallel to the chord between its neighbours, and at the ends it is the
  // first or last chord turned back by half a step.
  const step = last > 0 ? (4 * Math.atan(bulge)) / last : 0;
  const tangents = points.map(([x, y], k): Vec2 => {
    if (k === 0) {
      const [x1, y1] = points[1]!;
      return turn(unit(x1 - x, y1 - y), -step / 2);
    }
    if (k === last) {
      const [x0, y0] = points[k - 1]!;
      return turn(unit(x - x0, y - y0), step / 2);
    }
    const [xa, ya] = points[k - 1]!;
    const [xb, yb] = points[k + 1]!;
    return unit(xb - xa, yb - ya);
  });
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  points.forEach(([x, y], k) => {
    const half = startHalf + (endHalf - startHalf) * (total > 0 ? lengths[k]! / total : 0);
    const [tx, ty] = tangents[k]!;
    left.push([x - ty * half, y + tx * half]);
    right.push([x + ty * half, y - tx * half]);
  });
  return {
    points: [...left, ...right.reverse()],
    startTangent: tangents[0]!,
    endTangent: tangents[last]!,
    startHalf,
    endHalf,
  };
}

/** Longest mitre, in half widths, before a sharp corner is bevelled instead. */
const MITRE_LIMIT = 10;

/**
 * Fills the notch on the outside of the corner where band `a` meets band `b`
 * at `p`, as AutoCAD does with a mitre (a bevel for very sharp corners).
 */
function joinOutline(p: Vec2, a: Band, b: Band): Vec2[] | null {
  const ta = a.endTangent;
  const tb = b.startTangent;
  const cross = ta[0] * tb[1] - ta[1] * tb[0];
  if (Math.abs(cross) < 1e-9) return null;
  // Turning left, the outside of the corner is on the right.
  const side = cross > 0 ? -1 : 1;
  const ea: Vec2 = [p[0] - ta[1] * a.endHalf * side, p[1] + ta[0] * a.endHalf * side];
  const sb: Vec2 = [p[0] - tb[1] * b.startHalf * side, p[1] + tb[0] * b.startHalf * side];
  // Where the outer edge of `a`, carried on, meets the outer edge of `b`, carried back.
  const s = ((sb[0] - ea[0]) * tb[1] - (sb[1] - ea[1]) * tb[0]) / cross;
  const mitre: Vec2 = [ea[0] + ta[0] * s, ea[1] + ta[1] * s];
  const reach = Math.hypot(mitre[0] - p[0], mitre[1] - p[1]);
  if (s >= 0 && reach <= MITRE_LIMIT * Math.max(a.endHalf, b.startHalf)) {
    return [p, ea, mitre, sb];
  }
  return [p, ea, sb];
}

/**
 * Splits a polyline with widths into what AutoCAD draws: segments wider than
 * `minWidth` (world units) become filled bands, tapering linearly from the
 * start width to the end width, with flat ends and mitred corners; the other
 * segments stay centre lines, drawn with the line weight.
 */
export function widePolyline(
  vertices: readonly CadVertex[],
  closed: boolean,
  tolerance: number,
  minWidth: number,
): WidePolyline {
  const shapes: Vec2[][] = [];
  const runs: Vec2[][] = [];
  const count = vertices.length < 2 ? 0 : closed ? vertices.length : vertices.length - 1;
  // Band of each segment, or null where the segment is drawn as a line.
  const bands: (Band | null)[] = [];
  let run: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const v0 = vertices[i]!;
    const v1 = vertices[(i + 1) % vertices.length]!;
    const p0: Vec2 = [v0.x, v0.y];
    const points = [p0, ...bulgePoints(p0, [v1.x, v1.y], v0.bulge, tolerance)];
    const startWidth = v0.startWidth ?? 0;
    const endWidth = v0.endWidth ?? 0;
    if (!(Math.hypot(v1.x - v0.x, v1.y - v0.y) > 0)) {
      // A repeated vertex draws nothing (as a line it would leave a round dot).
      bands.push(null);
      continue;
    }
    if (Math.max(startWidth, endWidth) <= minWidth) {
      if (run.length === 0) run.push(p0);
      run.push(...points.slice(1));
      bands.push(null);
      continue;
    }
    if (run.length >= 2) runs.push(run);
    run = [];
    const band = bandOutline(points, v0.bulge, startWidth / 2, endWidth / 2);
    shapes.push(band.points);
    bands.push(band);
  }
  if (run.length >= 2) runs.push(run);
  for (let i = 0; i < count; i += 1) {
    if (i === 0 && !closed) continue;
    const a = bands[(i + count - 1) % count];
    const b = bands[i];
    if (!a || !b || !(a.endHalf > 0) || !(b.startHalf > 0)) continue;
    const v = vertices[i]!;
    const join = joinOutline([v.x, v.y], a, b);
    if (join) shapes.push(join);
  }
  return { shapes, runs };
}

/** Points on an elliptical arc; parameters in radians, counter-clockwise. */
export function ellipsePoints(
  center: Vec2,
  majorAxis: Vec2,
  ratio: number,
  startParam: number,
  endParam: number,
  tolerance: number,
): Vec2[] {
  const a = Math.hypot(majorAxis[0], majorAxis[1]);
  const rotation = Math.atan2(majorAxis[1], majorAxis[0]);
  let sweep = endParam - startParam;
  while (sweep <= 0) sweep += TAU;
  if (sweep > TAU) sweep = TAU;
  const n = segmentsFor(a, sweep, tolerance);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const b = a * ratio;
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = startParam + (sweep * i) / n;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    points.push([center[0] + x * cos - y * sin, center[1] + x * sin + y * cos]);
  }
  return points;
}

/** Evaluates a (rational) B-spline with de Boor's algorithm. */
function deBoor(
  degree: number,
  points: readonly Vec2[],
  knots: readonly number[],
  weights: readonly number[] | undefined,
  t: number,
): Vec2 {
  const n = points.length - 1;
  let span = degree;
  while (span < n && t >= knots[span + 1]!) span += 1;
  const d: [number, number, number][] = [];
  for (let j = 0; j <= degree; j += 1) {
    const p = points[span - degree + j]!;
    const w = weights?.[span - degree + j] ?? 1;
    d.push([p[0] * w, p[1] * w, w]);
  }
  for (let r = 1; r <= degree; r += 1) {
    for (let j = degree; j >= r; j -= 1) {
      const i = span - degree + j;
      const denom = knots[i + degree - r + 1]! - knots[i]!;
      const alpha = denom === 0 ? 0 : (t - knots[i]!) / denom;
      const a = d[j - 1]!;
      const b = d[j]!;
      d[j] = [
        (1 - alpha) * a[0] + alpha * b[0],
        (1 - alpha) * a[1] + alpha * b[1],
        (1 - alpha) * a[2] + alpha * b[2],
      ];
    }
  }
  const result = d[degree]!;
  return [result[0] / result[2], result[1] / result[2]];
}

/** Points along a spline; falls back to its fit points or control polygon when data is incomplete. */
export function splinePoints(
  degree: number,
  controlPoints: readonly Vec2[],
  knots: readonly number[],
  weights: readonly number[] | undefined,
  fitPoints: readonly Vec2[],
  segmentsPerSpan = 16,
): Vec2[] {
  const valid =
    degree >= 1 &&
    controlPoints.length > degree &&
    knots.length === controlPoints.length + degree + 1;
  if (!valid) return fitPoints.length >= 2 ? [...fitPoints] : [...controlPoints];
  const t0 = knots[degree]!;
  const t1 = knots[controlPoints.length]!;
  if (!(t1 > t0)) return [...controlPoints];
  const spans = controlPoints.length - degree;
  const n = Math.min(4096, spans * segmentsPerSpan);
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i === n ? t1 - 1e-12 * (t1 - t0) : t0 + ((t1 - t0) * i) / n;
    points.push(deBoor(degree, controlPoints, knots, weights, t));
  }
  return points;
}
