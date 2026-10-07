/**
 * The eraser (SEG-06): rubs out highlighter paint, to trim a segment's
 * highlighting finely where a stroke or an auto trace went too far. The
 * eraser is a disc dragged over the drawing. A stroke's paint is as wide as
 * its pen all along, so the eraser cannot thin it: where the eraser touches
 * the paint it cuts the stroke across its whole width, and what is left either
 * side stays, as strokes drawn with the same pen. A stroke rubbed out all
 * over, or down to crumbs, goes altogether.
 */
import type { StrokeGeometry } from '../schema/types';
import { boxRegion, discRegion, overlaps, strokeOutside, type Region } from './esdv-boundary';
import { geometryBounds, type Box, type XY } from './geometry';

/** Stroke bounds, worked out once per geometry: the eraser asks for them on every move. */
const boundsCache = new WeakMap<StrokeGeometry, Box>();

function boundsOf(stroke: StrokeGeometry): Box {
  let box = boundsCache.get(stroke);
  if (!box) {
    box = geometryBounds(stroke);
    boundsCache.set(stroke, box);
  }
  return box;
}

/** What a disc of `radius` covers moving from `a` to `b`: a disc, or a capsule. */
function sweep(a: XY, b: XY, radius: number): Region[] {
  const regions = [discRegion(a.x, a.y, radius)];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length > 0) {
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    regions.push(discRegion(b.x, b.y, radius), boxRegion(centre, ux, uy, length / 2, radius));
  }
  return regions;
}

function sweepBounds(a: XY, b: XY, radius: number): Box {
  return {
    minX: Math.min(a.x, b.x) - radius,
    minY: Math.min(a.y, b.y) - radius,
    maxX: Math.max(a.x, b.x) + radius,
    maxY: Math.max(a.y, b.y) + radius,
  };
}

/**
 * What is left of a highlighter stroke once the eraser, `diameter` across,
 * has moved from `a` to `b` over it (a click: from a point to itself). Null
 * when it does not touch the stroke's paint; otherwise the pieces left, none
 * when it rubbed the stroke out. The stroke's path is kept out of the eraser
 * widened by half the pen width, so no paint is left where the eraser went.
 */
export function eraseStroke(
  stroke: StrokeGeometry,
  a: XY,
  b: XY,
  diameter: number,
): StrokeGeometry[] | null {
  // A stroke's bounds take in its width, so they meet the eraser's own when the paint does.
  if (!overlaps(sweepBounds(a, b, diameter / 2), boundsOf(stroke))) return null;
  return strokeOutside(stroke, sweep(a, b, diameter / 2 + stroke.width / 2));
}

/** A stroke the eraser can rub out: a highlighter marker's id and geometry. */
export interface ErasableStroke {
  id: string;
  geometry: StrokeGeometry;
}

/** The eraser being dragged: what is left of each stroke it has gone over. */
export interface Erasure {
  /** Each stroke the eraser has touched, as it was before. */
  readonly from: ReadonlyMap<string, StrokeGeometry>;
  /** What is left of it so far: no pieces once it is rubbed out. */
  readonly left: ReadonlyMap<string, readonly StrokeGeometry[]>;
}

export const NO_ERASURE: Erasure = { from: new Map(), left: new Map() };

/**
 * The erasure once the eraser, `diameter` across, has moved on from `a` to
 * `b` over `strokes`: the paint it went over is rubbed out of what was left.
 * The same erasure when it touched no paint, so a caller can tell nothing
 * changed.
 */
export function eraseAlong(
  erasure: Erasure,
  strokes: Iterable<ErasableStroke>,
  a: XY,
  b: XY,
  diameter: number,
): Erasure {
  let from: Map<string, StrokeGeometry> | null = null;
  let left: Map<string, readonly StrokeGeometry[]> | null = null;
  for (const { id, geometry } of strokes) {
    const pieces = erasure.left.get(id) ?? [geometry];
    // Pieces it does not touch are kept as they are.
    let next: StrokeGeometry[] | null = null;
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i]!;
      const rest = eraseStroke(piece, a, b, diameter);
      if (rest) next ??= pieces.slice(0, i);
      next?.push(...(rest ?? [piece]));
    }
    if (!next) continue;
    from ??= new Map(erasure.from);
    left ??= new Map(erasure.left);
    if (!from.has(id)) from.set(id, geometry);
    left.set(id, next);
  }
  return from && left ? { from, left } : erasure;
}
