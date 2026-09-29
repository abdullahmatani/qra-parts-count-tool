/**
 * ESDVs as segment boundaries on a drawing (SEG-01). An ESDV is drawn as a
 * ring round the valve or as a double line across the pipe; an end flange,
 * where a segment ends without an ESDV, as a bar across the pipe (a double
 * line's geometry). Highlighter strokes stop at them: a stroke that runs
 * through one is cut there, into a piece on each side, and the highlighter's
 * magnet starts a stroke on one when the pointer is near it.
 */
import type {
  CircleGeometry,
  DoubleLineGeometry,
  MarkerGeometry,
  Size2D,
  StrokeGeometry,
} from '../schema/types';
import {
  closestOnSegment,
  dedupePoints,
  distanceToSegment,
  geometryBounds,
  type Box,
  type XY,
} from './geometry';

export type EsdvGeometry = CircleGeometry | DoubleLineGeometry;

export function isEsdvGeometry(geometry: MarkerGeometry): geometry is EsdvGeometry {
  return geometry.type === 'circle' || geometry.type === 'doubleLine';
}

// ---------------------------------------------------------------------------
// Double lines
// ---------------------------------------------------------------------------

/** Gap between the two lines: 9.5 pt on an A1 sheet (2384 pt), about 3.4 mm. */
const GAP_FRACTION = 1 / 250;

/** Length of a double line placed with a click: as long as a new ESDV ring is wide. */
export const DOUBLE_LINE_LENGTH_FRACTION = 1 / 100;

/** The gap between a double line's two lines on a sheet, in drawing units. */
export function doubleLineGap(sheet: Size2D): number {
  return Math.max(sheet.width, sheet.height) * GAP_FRACTION;
}

/** A double line across the line from `a` to `b`. */
export function doubleLine(a: XY, b: XY, gap: number): DoubleLineGeometry {
  return {
    type: 'doubleLine',
    points: [
      [a.x, a.y],
      [b.x, b.y],
    ],
    gap,
  };
}

/** A double line `length` long, centred on `centre`, at `angle` (radians, y down). */
export function doubleLineAt(
  centre: XY,
  angle: number,
  length: number,
  gap: number,
): DoubleLineGeometry {
  const dx = (Math.cos(angle) * length) / 2;
  const dy = (Math.sin(angle) * length) / 2;
  return doubleLine(
    { x: centre.x - dx, y: centre.y - dy },
    { x: centre.x + dx, y: centre.y + dy },
    gap,
  );
}

/** Rounds an angle to the nearest multiple of 45°, as when drawing with Shift held. */
export function snapAngle(angle: number): number {
  const step = Math.PI / 4;
  return Math.round(angle / step) * step;
}

/**
 * A double line placed with a click at `p`: across the highlighter stroke
 * under it (centred on the stroke, square to it and longer than it is wide),
 * else across the drawn line under it (`line`, its middle and direction),
 * otherwise at the angle and length used last. `tolerance` is the hit
 * tolerance in drawing units.
 */
export function doubleLineForClick(
  p: XY,
  strokes: Iterable<StrokeGeometry>,
  last: { angle: number; length: number },
  gap: number,
  tolerance: number,
  line: { point: XY; angle: number } | null = null,
): DoubleLineGeometry {
  let best: { centre: XY; angle: number; width: number } | null = null;
  let bestDistance = Infinity;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.points.length; i += 1) {
      const [ax, ay] = stroke.points[i - 1]!;
      const [bx, by] = stroke.points[i]!;
      const a = { x: ax, y: ay };
      const b = { x: bx, y: by };
      const centre = closestOnSegment(p, a, b);
      const distance = Math.hypot(p.x - centre.x, p.y - centre.y);
      if (distance > stroke.width / 2 + tolerance || distance >= bestDistance) continue;
      if (ax === bx && ay === by) continue;
      bestDistance = distance;
      best = { centre, angle: Math.atan2(by - ay, bx - ax) + Math.PI / 2, width: stroke.width };
    }
  }
  if (!best && line) return doubleLineAt(line.point, line.angle + Math.PI / 2, last.length, gap);
  if (!best) return doubleLineAt(p, last.angle, last.length, gap);
  return doubleLineAt(best.centre, best.angle, Math.max(last.length, best.width * 1.5), gap);
}

// ---------------------------------------------------------------------------
// Cutting highlighter strokes
// ---------------------------------------------------------------------------

/** Minimum overlap, as a fraction of a path segment, that counts as running through an ESDV. */
const EPSILON = 1e-9;

/**
 * The part of the path segment from `a` to `b` inside an area, as fractions
 * of the way from `a` (0) to `b` (1), or null when it stays outside.
 */
export type Region = (a: XY, b: XY) => [number, number] | null;

function discRegion(cx: number, cy: number, radius: number): Region {
  return (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = a.x - cx;
    const fy = a.y - cy;
    const qa = dx * dx + dy * dy;
    const qc = fx * fx + fy * fy - radius * radius;
    if (qa === 0) return qc < 0 ? [0, 1] : null;
    const qb = 2 * (fx * dx + fy * dy);
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant <= 0) return null;
    const root = Math.sqrt(discriminant);
    const t0 = Math.max(0, (-qb - root) / (2 * qa));
    const t1 = Math.min(1, (-qb + root) / (2 * qa));
    return t1 - t0 > EPSILON ? [t0, t1] : null;
  };
}

/** A rectangle centred on `centre`, its long axis along the unit vector (ux, uy). */
function boxRegion(
  centre: XY,
  ux: number,
  uy: number,
  halfLength: number,
  halfWidth: number,
): Region {
  return (a, b) => {
    const ax = a.x - centre.x;
    const ay = a.y - centre.y;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Along the axis, then across it (Liang–Barsky clipping).
    const slabs: [number, number, number][] = [
      [ax * ux + ay * uy, dx * ux + dy * uy, halfLength],
      [ay * ux - ax * uy, dy * ux - dx * uy, halfWidth],
    ];
    let t0 = 0;
    let t1 = 1;
    for (const [start, delta, half] of slabs) {
      if (delta === 0) {
        if (Math.abs(start) >= half) return null;
        continue;
      }
      const lo = (-half - start) / delta;
      const hi = (half - start) / delta;
      t0 = Math.max(t0, Math.min(lo, hi));
      t1 = Math.min(t1, Math.max(lo, hi));
      if (t1 - t0 <= EPSILON) return null;
    }
    return [t0, t1];
  };
}

/**
 * What a highlighter stroke `width` wide must keep its path out of, so its
 * paint (round ends included) stops at the ESDV: the ring, or the band
 * between the two lines, widened by half the stroke's width.
 */
export function cutRegion(esdv: EsdvGeometry, width: number): Region {
  const pad = width / 2;
  if (esdv.type === 'circle') return discRegion(esdv.cx, esdv.cy, esdv.r + pad);
  const [[x1, y1], [x2, y2]] = esdv.points;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = length > 0 ? [(x2 - x1) / length, (y2 - y1) / length] : [1, 0];
  const centre = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  return boxRegion(centre, ux, uy, length / 2 + pad, esdv.gap / 2 + pad);
}

function lerp(a: XY, b: XY, t: number): XY {
  if (t === 0) return a;
  if (t === 1) return b;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The parts of a path outside every region, in order, or null when the path
 * does not enter any of them.
 */
export function pathOutside(points: readonly XY[], regions: readonly Region[]): XY[][] | null {
  const pieces: XY[][] = [];
  let current: XY[] | null = null;
  let entered = false;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const inside = regions
      .map((region) => region(a, b))
      .filter((span): span is [number, number] => span !== null)
      .sort((x, y) => x[0] - y[0]);
    if (inside.length) entered = true;
    // The spans of a→b outside every region.
    const outside: [number, number][] = [];
    let from = 0;
    for (const [t0, t1] of inside) {
      if (t0 > from) outside.push([from, t0]);
      from = Math.max(from, t1);
    }
    if (from < 1) outside.push([from, 1]);
    // A piece carries on from the last path segment only if this one starts outside.
    if (current && outside[0]?.[0] !== 0) {
      pieces.push(current);
      current = null;
    }
    for (const [t0, t1] of outside) {
      if (current) current.push(lerp(a, b, t1));
      else current = [lerp(a, b, t0), lerp(a, b, t1)];
      if (t1 < 1) {
        pieces.push(current);
        current = null;
      }
    }
  }
  if (current) pieces.push(current);
  return entered ? pieces : null;
}

function pathLength(points: readonly XY[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return length;
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * A highlighter stroke cut at ESDVs: its pieces outside them, each drawn with
 * the same pen. Null when the stroke does not run into an ESDV, or lies
 * wholly inside one (it is then left as drawn). Crumbs shorter than half the
 * pen width are dropped.
 */
export function cutStroke(
  stroke: StrokeGeometry,
  esdvs: Iterable<EsdvGeometry>,
): StrokeGeometry[] | null {
  const bounds = geometryBounds(stroke);
  const pad = stroke.width / 2;
  const regions: Region[] = [];
  for (const esdv of esdvs) {
    const box = geometryBounds(esdv);
    const reach = {
      minX: box.minX - pad,
      minY: box.minY - pad,
      maxX: box.maxX + pad,
      maxY: box.maxY + pad,
    };
    if (overlaps(reach, bounds)) regions.push(cutRegion(esdv, stroke.width));
  }
  if (!regions.length) return null;
  const pieces = pathOutside(
    stroke.points.map(([x, y]) => ({ x, y })),
    regions,
  );
  if (!pieces) return null;
  const kept = pieces
    .map((piece) => dedupePoints(piece, 0))
    .filter((piece) => piece.length >= 2 && pathLength(piece) >= pad);
  if (!kept.length) return null;
  return kept.map((piece) => ({
    type: 'stroke',
    points: piece.map((p): [number, number] => [p.x, p.y]),
    width: stroke.width,
  }));
}

// ---------------------------------------------------------------------------
// The highlighter's magnet
// ---------------------------------------------------------------------------

/** How far `p` is from an ESDV: 0 on or inside it. */
function distanceToEsdv(esdv: EsdvGeometry, p: XY): number {
  if (esdv.type === 'circle') return Math.max(0, Math.hypot(p.x - esdv.cx, p.y - esdv.cy) - esdv.r);
  const [[x1, y1], [x2, y2]] = esdv.points;
  return Math.max(0, distanceToSegment(p, { x: x1, y: y1 }, { x: x2, y: y2 }) - esdv.gap / 2);
}

/**
 * Where a stroke drawn from an ESDV starts: the ring's centre, or the point
 * of the double line's centre line (on the pipe it crosses) nearest to `p`.
 */
export function esdvAnchor(esdv: EsdvGeometry, p: XY): XY {
  if (esdv.type === 'circle') return { x: esdv.cx, y: esdv.cy };
  const [[x1, y1], [x2, y2]] = esdv.points;
  return closestOnSegment(p, { x: x1, y: y1 }, { x: x2, y: y2 });
}

/**
 * The magnet: the anchor of the ESDV marker nearest to `p`, when `p` is
 * within `reach` of it, or null. Markers that are not ESDV shapes are ignored.
 */
export function snapToEsdv<T extends { geometry: MarkerGeometry }>(
  esdvs: Iterable<T>,
  p: XY,
  reach: number,
): { marker: T; point: XY } | null {
  let best: { marker: T; point: XY } | null = null;
  let bestDistance = reach;
  for (const marker of esdvs) {
    const geometry = marker.geometry;
    if (!isEsdvGeometry(geometry)) continue;
    const distance = distanceToEsdv(geometry, p);
    if (distance <= bestDistance) {
      best = { marker, point: esdvAnchor(geometry, p) };
      bestDistance = distance;
    }
  }
  return best;
}
