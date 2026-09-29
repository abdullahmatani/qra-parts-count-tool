/**
 * What the auto trace stops at on a drawing, in the pixels of the rendered
 * sheet: ESDVs (rings and double lines), end flanges, and drawing links, the
 * off-page connectors where the pipe carries on on another drawing. The
 * sides of each ESDV and end flange say which segments meet there.
 */
import { isBoundaryMarker } from '../end-flange';
import type { ProjectDoc } from '../model';
import type { MarkerGeometry, Point, StrokeGeometry } from '../schema/types';
import type { BarrierShape, BoundarySides, TraceBarrier } from './auto-trace';
import { distanceToSegment, geometryBounds, type XY } from './geometry';

export interface TraceBoundaries {
  barriers: TraceBarrier[];
  sides: BoundarySides[];
  /** Ids of the drawing links among the barriers. */
  links: string[];
}

function shapeOf(geometry: MarkerGeometry, scale: number): BarrierShape | null {
  if (geometry.type === 'circle') {
    return {
      type: 'disc',
      cx: geometry.cx * scale,
      cy: geometry.cy * scale,
      r: geometry.r * scale,
    };
  }
  if (geometry.type !== 'doubleLine') return null;
  const [[x1, y1], [x2, y2]] = geometry.points;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = length > 0 ? [(x2 - x1) / length, (y2 - y1) / length] : [1, 0];
  return {
    type: 'box',
    cx: ((x1 + x2) / 2) * scale,
    cy: ((y1 + y2) / 2) * scale,
    ux,
    uy,
    halfLength: (length / 2) * scale,
    halfWidth: (geometry.gap / 2) * scale,
  };
}

/** The boundaries on a drawing, at `scale` pixels per drawing unit. */
export function traceBoundaries(
  doc: Pick<ProjectDoc, 'markers' | 'links'>,
  drawingId: string,
  scale: number,
): TraceBoundaries {
  const barriers: TraceBarrier[] = [];
  const sides: BoundarySides[] = [];
  const links: string[] = [];
  for (const marker of Object.values(doc.markers)) {
    if (marker.drawingId !== drawingId || !isBoundaryMarker(marker)) continue;
    const shape = shapeOf(marker.geometry, scale);
    if (!shape) continue;
    barriers.push({ id: marker.id, shape });
    if (marker.esdv) {
      sides.push({
        id: marker.id,
        sides: [marker.esdv.upstreamSegmentId, marker.esdv.downstreamSegmentId],
      });
    } else {
      sides.push({ id: marker.id, sides: [marker.segmentId], endFlange: true });
    }
  }
  for (const link of Object.values(doc.links)) {
    if (link.sourceDrawingId !== drawingId) continue;
    const { x, y, width, height } = link.rect;
    barriers.push({
      id: link.id,
      shape: {
        type: 'box',
        cx: (x + width / 2) * scale,
        cy: (y + height / 2) * scale,
        ux: 1,
        uy: 0,
        halfLength: (width / 2) * scale,
        halfWidth: (height / 2) * scale,
      },
    });
    links.push(link.id);
  }
  return { barriers, sides, links };
}

/** Whether a drawing has an ESDV, end flange or drawing link for the auto trace to run out to. */
export function hasTraceBoundaries(
  doc: Pick<ProjectDoc, 'markers' | 'links'>,
  drawingId: string,
): boolean {
  return (
    Object.values(doc.markers).some((m) => m.drawingId === drawingId && isBoundaryMarker(m)) ||
    Object.values(doc.links).some((link) => link.sourceDrawingId === drawingId)
  );
}

/**
 * How much of a path (0 … 1, by length) is already painted by `strokes`: a
 * piece counts when its middle lies within the middle half of a stroke.
 */
export function paintedShare(path: readonly Point[], strokes: readonly StrokeGeometry[]): number {
  const near = strokes.map((stroke) => ({ stroke, box: geometryBounds(stroke) }));
  let total = 0;
  let painted = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    const length = Math.hypot(bx - ax, by - ay);
    total += length;
    const mid: XY = { x: (ax + bx) / 2, y: (ay + by) / 2 };
    const covered = near.some(({ stroke, box }) => {
      if (mid.x < box.minX || mid.x > box.maxX || mid.y < box.minY || mid.y > box.maxY) {
        return false;
      }
      for (let k = 1; k < stroke.points.length; k += 1) {
        const [px, py] = stroke.points[k - 1]!;
        const [qx, qy] = stroke.points[k]!;
        if (distanceToSegment(mid, { x: px, y: py }, { x: qx, y: qy }) <= stroke.width / 4) {
          return true;
        }
      }
      return false;
    });
    if (covered) painted += length;
  }
  return total > 0 ? painted / total : 1;
}
