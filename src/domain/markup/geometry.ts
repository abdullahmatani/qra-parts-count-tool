/**
 * Marker geometry in drawing coordinates (ANN-01, ANN-02): bounds, hit
 * testing, moving and resizing. Pure functions, shared by the canvas tools and
 * the annotated PDF export.
 */
import type {
  CircleGeometry,
  DoubleLineGeometry,
  MarkerGeometry,
  MarkerSymbol,
  Point,
} from '../schema/types';

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
    case 'polyline':
    case 'stroke': {
      // A highlighter stroke covers half its width either side of its path.
      const pad = geometry.type === 'stroke' ? geometry.width / 2 : 0;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of geometry.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }
    case 'doubleLine':
      return unionBoxes(
        doubleLineStrokes(geometry)
          .flat()
          .map((p) => boxFromPoints(p, p)),
      )!;
  }
}

export function geometryCentre(geometry: MarkerGeometry): XY {
  if (geometry.type === 'circle') return { x: geometry.cx, y: geometry.cy };
  const box = geometryBounds(geometry);
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/**
 * The two lines of a double line: its centre line moved `gap / 2` to either
 * side, square to it.
 */
export function doubleLineStrokes(g: DoubleLineGeometry): [[XY, XY], [XY, XY]] {
  const [[x1, y1], [x2, y2]] = g.points;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / length) * (g.gap / 2);
  const ny = ((x2 - x1) / length) * (g.gap / 2);
  return [
    [
      { x: x1 + nx, y: y1 + ny },
      { x: x2 + nx, y: y2 + ny },
    ],
    [
      { x: x1 - nx, y: y1 - ny },
      { x: x2 - nx, y: y2 - ny },
    ],
  ];
}

/** The band between a double line's two lines, as a closed outline (an end flange's bar). */
export function doubleLineBand(g: DoubleLineGeometry): XY[] {
  const [[a1, b1], [a2, b2]] = doubleLineStrokes(g);
  return [a1, b1, b2, a2];
}

/** The point of the line segment from `a` to `b` nearest to `p`. */
export function closestOnSegment(p: XY, a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  const clamped = Math.max(0, Math.min(1, t));
  return { x: a.x + clamped * dx, y: a.y + clamped * dy };
}

/** Where a double line's label goes: its top end (the right-hand one when level). */
export function doubleLineTop(g: DoubleLineGeometry): XY {
  const ends = doubleLineStrokes(g).flat();
  const eps = 1e-9 * (Math.abs(ends[0]!.y) + 1);
  return ends.reduce((best, p) =>
    p.y < best.y - eps || (Math.abs(p.y - best.y) <= eps && p.x > best.x) ? p : best,
  );
}

export function distanceToSegment(p: XY, a: XY, b: XY): number {
  const q = closestOnSegment(p, a, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

// ---------------------------------------------------------------------------
// Symbols: how a circle marker is drawn (ring, dot, square or free-form)
// ---------------------------------------------------------------------------

/** The parts of a marker's style that shape its outline (see MarkerStyle). */
export interface SymbolStyle {
  symbol: MarkerSymbol;
  outline: readonly (readonly [number, number])[] | null;
}

/** A dot's radius relative to a ring placed with the same click. */
export const DOT_SCALE = 0.4;

/**
 * The outline of a square or free-form symbol in drawing coordinates, or null
 * for a round one (a ring or a dot). A square's side is the circle's diameter,
 * so its bounds are the circle's; a free-form outline is scaled by the radius.
 */
export function symbolPolygon(g: CircleGeometry, style: SymbolStyle | undefined): XY[] | null {
  switch (style?.symbol) {
    case 'square':
      return [
        { x: g.cx - g.r, y: g.cy - g.r },
        { x: g.cx + g.r, y: g.cy - g.r },
        { x: g.cx + g.r, y: g.cy + g.r },
        { x: g.cx - g.r, y: g.cy + g.r },
      ];
    case 'freeform':
      return style.outline
        ? style.outline.map(([x, y]) => ({ x: g.cx + x * g.r, y: g.cy + y * g.r }))
        : null;
    default:
      return null;
  }
}

/** Even-odd test: whether `p` lies inside the closed polygon. */
export function insidePolygon(p: XY, polygon: readonly XY[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function nearPolygon(p: XY, polygon: readonly XY[], tolerance: number): boolean {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (distanceToSegment(p, a, b) <= tolerance) return true;
  }
  return false;
}

/** A marker's radius after its symbol changes: a dot is DOT_SCALE of the ring around the same symbol. */
export function radiusForSymbol(r: number, from: MarkerSymbol, to: MarkerSymbol): number {
  const scale = (symbol: MarkerSymbol) => (symbol === 'dot' ? DOT_SCALE : 1);
  return Math.max(MIN_MARKER_SIZE, (r * scale(to)) / scale(from));
}

/**
 * Ramer–Douglas–Peucker: drops points that lie within `tolerance` of the line
 * through their neighbours, so a hand-drawn outline keeps its shape with far
 * fewer points.
 */
export function simplifyPath(points: readonly XY[], tolerance: number): XY[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let index = -1;
    let furthest = tolerance;
    for (let i = a + 1; i < b; i += 1) {
      const d = distanceToSegment(points[i]!, points[a]!, points[b]!);
      if (d > furthest) {
        furthest = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Most points a free-form outline keeps (the project file allows 2000). */
export const MAX_OUTLINE_POINTS = 500;

/**
 * A free-form symbol from a hand-drawn path: its bounding circle (centred on
 * the path's bounds) and the outline relative to it. Null when the path
 * encloses nothing.
 */
export function freeformSymbol(
  path: readonly XY[],
): { geometry: CircleGeometry; outline: Point[] } | null {
  let points = path;
  if (points.length > MAX_OUTLINE_POINTS) {
    const step = points.length / MAX_OUTLINE_POINTS;
    points = Array.from({ length: MAX_OUTLINE_POINTS }, (_, i) => path[Math.floor(i * step)]!);
  }
  if (points.length < 3) return null;
  const box = unionBoxes(points.map((p) => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })))!;
  if (box.maxX - box.minX < MIN_MARKER_SIZE || box.maxY - box.minY < MIN_MARKER_SIZE) return null;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const r = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  // Four decimals keep the outline to within 1/10,000 of the radius.
  const unit = (v: number) => Math.round(v * 10_000) / 10_000;
  return {
    geometry: { type: 'circle', cx, cy, r },
    outline: points.map((p): Point => [unit((p.x - cx) / r), unit((p.y - cy) / r)]),
  };
}

/**
 * Whether `p` hits the marker: inside a circle, symbol or rectangle, or within
 * `tolerance` of its outline or of a polyline.
 */
export function hitsGeometry(
  geometry: MarkerGeometry,
  p: XY,
  tolerance: number,
  style?: SymbolStyle,
): boolean {
  switch (geometry.type) {
    case 'circle': {
      const polygon = symbolPolygon(geometry, style);
      if (polygon) return insidePolygon(p, polygon) || nearPolygon(p, polygon, tolerance);
      return Math.hypot(p.x - geometry.cx, p.y - geometry.cy) <= geometry.r + tolerance;
    }
    case 'rect':
      return (
        p.x >= geometry.x - tolerance &&
        p.x <= geometry.x + geometry.width + tolerance &&
        p.y >= geometry.y - tolerance &&
        p.y <= geometry.y + geometry.height + tolerance
      );
    case 'polyline':
    case 'stroke': {
      const reach = tolerance + (geometry.type === 'stroke' ? geometry.width / 2 : 0);
      const points = geometry.points;
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]!;
        const b = points[i]!;
        if (distanceToSegment(p, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) <= reach) {
          return true;
        }
      }
      return false;
    }
    case 'doubleLine': {
      // Either line, or the gap between them.
      const [[x1, y1], [x2, y2]] = geometry.points;
      return (
        distanceToSegment(p, { x: x1, y: y1 }, { x: x2, y: y2 }) <= geometry.gap / 2 + tolerance
      );
    }
  }
}

/**
 * Picks the marker under `p`. When markers overlap, the one with the smallest
 * bounds wins, so a circle inside a highlighted area can still be picked.
 */
export function pickMarker<T extends { id: string; geometry: MarkerGeometry; style?: SymbolStyle }>(
  markers: Iterable<T>,
  p: XY,
  tolerance: number,
): T | null {
  let best: T | null = null;
  let bestArea = Infinity;
  for (const marker of markers) {
    if (!hitsGeometry(marker.geometry, p, tolerance, marker.style)) continue;
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
    case 'stroke':
      return { ...geometry, points: geometry.points.map(([x, y]) => [x + dx, y + dy]) };
    case 'doubleLine': {
      const [[x1, y1], [x2, y2]] = geometry.points;
      return {
        ...geometry,
        points: [
          [x1 + dx, y1 + dy],
          [x2 + dx, y2 + dy],
        ],
      };
    }
  }
}

/** Resize handles: `n`…`nw` for rectangles and circles, `v<i>` for polyline and double line ends. */
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
    case 'doubleLine':
      return geometry.points.map(([x, y], i) => ({ id: `v${i}` as const, x, y }));
    case 'stroke':
      // A hand-drawn stroke has too many points to drag one by one; its
      // width is set in the panel instead.
      return [];
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
    case 'doubleLine': {
      const [a, b] = geometry.points;
      const index = handle === 'v0' ? 0 : handle === 'v1' ? 1 : -1;
      if (index < 0) return geometry;
      const other = index === 0 ? b : a;
      // Both ends in one place would leave the lines without a direction.
      if (Math.hypot(p.x - other[0], p.y - other[1]) < MIN_MARKER_SIZE) return geometry;
      return {
        ...geometry,
        points:
          index === 0
            ? [
                [p.x, p.y],
                [b[0], b[1]],
              ]
            : [
                [a[0], a[1]],
                [p.x, p.y],
              ],
      };
    }
    case 'stroke':
      return geometry;
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
