/**
 * Highlighted segments (SEG-06): which segment's highlighting an equipment
 * marker sits on. A segment is highlighted with highlighter strokes painted
 * over its pipework and equipment, and with dashed highlights: zones drawn
 * round an area (a rectangle, or a line whose ends meet) and line runs traced
 * along a pipe. Equipment placed on, or moved onto, a segment's highlighting
 * can go to that segment.
 */
import type { ProjectDoc } from '../model';
import type { CircleGeometry, Marker, MarkerGeometry, Point } from '../schema/types';
import {
  boxArea,
  distanceToSegment,
  geometryBounds,
  insidePolygon,
  type Box,
  type XY,
} from './geometry';

/** One piece of a segment's highlighting on a drawing. */
export interface Highlight {
  segmentId: string;
  geometry: MarkerGeometry;
  bounds: Box;
  /** A zone covers an area; strokes and line runs follow the pipework. */
  zone: boolean;
}

/** How near a dashed line's ends are, as a fraction of its size, for it to outline a zone. */
const CLOSE_FRACTION = 0.05;

/** Whether a dashed line's ends meet, so it outlines an area rather than tracing a run. */
export function outlinesArea(points: readonly Point[]): boolean {
  if (points.length < 4) return false;
  const [x1, y1] = points[0]!;
  const [x2, y2] = points[points.length - 1]!;
  const box = geometryBounds({ type: 'polyline', points: [...points] });
  const size = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  return Math.hypot(x2 - x1, y2 - y1) <= size * CLOSE_FRACTION;
}

/** Whether a marker is equipment that goes with the highlighting it sits on: a circle, not an ESDV. */
export function isEquipmentMarker(marker: Marker): boolean {
  return marker.shape === 'circle' && !marker.esdv;
}

/** The marker as highlighting, when it is a highlighter stroke or dashed highlight in a segment. */
export function highlightOf(doc: Pick<ProjectDoc, 'segments'>, marker: Marker): Highlight | null {
  if (marker.shape !== 'highlighter' && marker.shape !== 'dashedHighlight') return null;
  if (!marker.segmentId || !doc.segments[marker.segmentId]) return null;
  const { geometry } = marker;
  return {
    segmentId: marker.segmentId,
    geometry,
    bounds: geometryBounds(geometry),
    zone:
      geometry.type === 'rect' || (geometry.type === 'polyline' && outlinesArea(geometry.points)),
  };
}

/** The highlighting on a drawing. */
export function highlightsOn(
  doc: Pick<ProjectDoc, 'markers' | 'segments'>,
  drawingId: string,
): Highlight[] {
  const out: Highlight[] = [];
  for (const marker of Object.values(doc.markers)) {
    if (marker.drawingId !== drawingId) continue;
    const highlight = highlightOf(doc, marker);
    if (highlight) out.push(highlight);
  }
  return out;
}

function inBox(p: XY, box: Box, pad: number): boolean {
  return (
    p.x >= box.minX - pad && p.x <= box.maxX + pad && p.y >= box.minY - pad && p.y <= box.maxY + pad
  );
}

function distanceToPath(p: XY, points: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    best = Math.min(best, distanceToSegment(p, { x: ax, y: ay }, { x: bx, y: by }));
  }
  return best;
}

/**
 * The segment whose highlighting an equipment circle sits on, or null. It
 * sits on a highlighter stroke when its centre is on the paint, on a line run
 * when its ring reaches the line, and in a zone when its centre is inside it.
 * Strokes and runs follow the pipework, so the nearest of them wins over any
 * zone; otherwise the smallest zone wins. Of equals, the topmost wins.
 */
export function segmentUnder(
  highlights: readonly Highlight[],
  circle: CircleGeometry,
): string | null {
  const centre = { x: circle.cx, y: circle.cy };
  let onPath: string | null = null;
  let nearest = Infinity;
  let inZone: string | null = null;
  let smallest = Infinity;
  for (const { segmentId, geometry: g, bounds, zone } of highlights) {
    if (zone) {
      const area = boxArea(bounds);
      if (area > smallest || !inBox(centre, bounds, 0)) continue;
      const inside =
        g.type === 'rect' ||
        (g.type === 'polyline' &&
          insidePolygon(
            centre,
            g.points.map(([x, y]) => ({ x, y })),
          ));
      if (inside) {
        inZone = segmentId;
        smallest = area;
      }
    } else if (g.type === 'stroke' || g.type === 'polyline') {
      // A stroke's bounds already take in its width; a run's are its line.
      const reach = g.type === 'stroke' ? g.width / 2 : circle.r;
      if (!inBox(centre, bounds, g.type === 'stroke' ? 0 : reach)) continue;
      const distance = distanceToPath(centre, g.points);
      if (distance <= reach && distance <= nearest) {
        onPath = segmentId;
        nearest = distance;
      }
    }
  }
  return onPath ?? inZone;
}

/** The segment whose highlighting on a drawing an equipment circle sits on, or null. */
export function highlightedSegmentAt(
  doc: Pick<ProjectDoc, 'markers' | 'segments'>,
  drawingId: string,
  circle: CircleGeometry,
): string | null {
  return segmentUnder(highlightsOn(doc, drawingId), circle);
}
