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
