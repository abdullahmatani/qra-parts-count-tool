/**
 * Marker geometry in drawing coordinates (ANN-01, ANN-02): bounds, hit
 * testing, moving and resizing. Pure functions, shared by the canvas tools and
 * the annotated PDF export.
 */
import type { MarkerGeometry } from '../schema/types';

export interface XY {
  x: number;
  y: number;
}

/** Axis-aligned box in drawing coordinates. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Smallest radius or rectangle side a marker can be resized to, in drawing units. */
export const MIN_MARKER_SIZE = 0.5;

export function boxFromPoints(a: XY, b: XY): Box {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function boxArea(box: Box): number {
  return (box.maxX - box.minX) * (box.maxY - box.minY);
}

export function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

export function unionBoxes(boxes: Iterable<Box>): Box | null {
  let out: Box | null = null;
  for (const box of boxes) {
    out = out
      ? {
          minX: Math.min(out.minX, box.minX),
          minY: Math.min(out.minY, box.minY),
          maxX: Math.max(out.maxX, box.maxX),
          maxY: Math.max(out.maxY, box.maxY),
        }
      : { ...box };
  }
  return out;
}

export function geometryBounds(geometry: MarkerGeometry): Box {
  switch (geometry.type) {
    case 'circle':
      return {
        minX: geometry.cx - geometry.r,
        minY: geometry.cy - geometry.r,
        maxX: geometry.cx + geometry.r,
        maxY: geometry.cy + geometry.r,
      };
    case 'rect':
      return {
        minX: geometry.x,
        minY: geometry.y,
        maxX: geometry.x + geometry.width,
        maxY: geometry.y + geometry.height,
      };
    case 'polyline': {
      const xs = geometry.points.map((p) => p[0]);
      const ys = geometry.points.map((p) => p[1]);
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    }
  }
}

export function geometryCentre(geometry: MarkerGeometry): XY {
  if (geometry.type === 'circle') return { x: geometry.cx, y: geometry.cy };
  const box = geometryBounds(geometry);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

export function distanceToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + clamped * dx), p.y - (a.y + clamped * dy));
}

/**
 * Whether `p` hits the marker: inside a circle or rectangle, or within
 * `tolerance` of its outline or of a polyline.
 */
export function hitsGeometry(geometry: MarkerGeometry, p: XY, tolerance: number): boolean {
  switch (geometry.type) {
    case 'circle':
      return Math.hypot(p.x - geometry.cx, p.y - geometry.cy) <= geometry.r + tolerance;
    case 'rect':
      return (
        p.x >= geometry.x - tolerance &&
        p.x <= geometry.x + geometry.width + tolerance &&
        p.y >= geometry.y - tolerance &&
        p.y <= geometry.y + geometry.height + tolerance
      );
    case 'polyline': {
      const points = geometry.points;
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]!;
        const b = points[i]!;
        if (distanceToSegment(p, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) <= tolerance) {
          return true;
        }
      }
      return false;
    }
  }
}

/**
 * Picks the marker under `p`. When markers overlap, the one with the smallest
 * bounds wins, so a circle inside a highlighted area can still be picked.
 */
export function pickMarker<T extends { id: string; geometry: MarkerGeometry }>(
  markers: Iterable<T>,
  p: XY,
  tolerance: number,
): T | null {
  let best: T | null = null;
  let bestArea = Infinity;
  for (const marker of markers) {
    if (!hitsGeometry(marker.geometry, p, tolerance)) continue;
    const area = boxArea(geometryBounds(marker.geometry));
    // `<=` keeps the last (topmost) of equal candidates.
    if (area <= bestArea) {
      best = marker;
      bestArea = area;
    }
  }
  return best;
}

/** Markers whose bounds lie completely inside `box` (window selection). */
export function markersInBox<T extends { geometry: MarkerGeometry }>(
  markers: Iterable<T>,
  box: Box,
): T[] {
  const out: T[] = [];
  for (const marker of markers) {
    if (boxContains(box, geometryBounds(marker.geometry))) out.push(marker);
  }
  return out;
}

export function translateGeometry(
  geometry: MarkerGeometry,
  dx: number,
  dy: number,
): MarkerGeometry {
  switch (geometry.type) {
    case 'circle':
      return { ...geometry, cx: geometry.cx + dx, cy: geometry.cy + dy };
    case 'rect':
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
    case 'polyline':
      return { ...geometry, points: geometry.points.map(([x, y]) => [x + dx, y + dy]) };
  }
}

/** Resize handles: `n`…`nw` for rectangles and circles, `v<i>` for polyline vertices. */
export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | `v${number}`;

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

export function geometryHandles(geometry: MarkerGeometry): Handle[] {
  switch (geometry.type) {
    case 'circle': {
      const { cx, cy, r } = geometry;
      return [
        { id: 'e', x: cx + r, y: cy },
        { id: 's', x: cx, y: cy + r },
        { id: 'w', x: cx - r, y: cy },
        { id: 'n', x: cx, y: cy - r },
      ];
    }
    case 'rect': {
      const { x, y, width: w, height: h } = geometry;
      return [
        { id: 'nw', x, y },
        { id: 'n', x: x + w / 2, y },
        { id: 'ne', x: x + w, y },
        { id: 'e', x: x + w, y: y + h / 2 },
        { id: 'se', x: x + w, y: y + h },
        { id: 's', x: x + w / 2, y: y + h },
        { id: 'sw', x, y: y + h },
        { id: 'w', x, y: y + h / 2 },
      ];
    }
    case 'polyline':
      return geometry.points.map(([x, y], i) => ({ id: `v${i}` as const, x, y }));
  }
}

/** Moves one handle of a marker to `p`. */
export function resizeGeometry(geometry: MarkerGeometry, handle: HandleId, p: XY): MarkerGeometry {
  switch (geometry.type) {
    case 'circle':
      return {
        ...geometry,
        r: Math.max(MIN_MARKER_SIZE, Math.hypot(p.x - geometry.cx, p.y - geometry.cy)),
      };
    case 'rect': {
      let minX = geometry.x;
      let minY = geometry.y;
      let maxX = geometry.x + geometry.width;
      let maxY = geometry.y + geometry.height;
      if (handle.includes('w')) minX = p.x;
      if (handle.includes('e')) maxX = p.x;
      if (handle.includes('n')) minY = p.y;
      if (handle.includes('s')) maxY = p.y;
      const box = boxFromPoints({ x: minX, y: minY }, { x: maxX, y: maxY });
      return {
        type: 'rect',
        x: box.minX,
        y: box.minY,
        width: Math.max(MIN_MARKER_SIZE, box.maxX - box.minX),
        height: Math.max(MIN_MARKER_SIZE, box.maxY - box.minY),
      };
    }
    case 'polyline': {
      const index = handle.startsWith('v') ? Number(handle.slice(1)) : -1;
      if (!(index >= 0 && index < geometry.points.length)) return geometry;
      const points = geometry.points.map((point, i): [number, number] =>
        i === index ? [p.x, p.y] : [point[0], point[1]],
      );
      return { ...geometry, points };
    }
  }
}

/** A rectangle geometry spanning two corner points. */
export function rectGeometry(a: XY, b: XY): Extract<MarkerGeometry, { type: 'rect' }> {
  const box = boxFromPoints(a, b);
  return {
    type: 'rect',
    x: box.minX,
    y: box.minY,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
  };
}

/** Drops consecutive points closer than `tolerance` (e.g. from a double-click). */
export function dedupePoints(points: readonly XY[], tolerance: number): XY[] {
  const out: XY[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > tolerance) out.push(p);
  }
  return out;
}
