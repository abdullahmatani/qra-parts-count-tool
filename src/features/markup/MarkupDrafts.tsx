import type { XY } from '@/domain/markup/geometry';
import { HIGHLIGHTER_ALPHA } from '@/domain/palette';
import type { CircleGeometry, MarkerSymbol, RectGeometry } from '@/domain/schema/types';

/**
 * A shape being drawn: a circle (drawn as the chosen symbol) or rectangle
 * geometry, the points of a line run, a free-form outline being traced, or a
 * highlighter stroke being painted (as it will look, in its segment's colour).
 */
export type DraftShape =
  | (CircleGeometry & { symbol?: MarkerSymbol })
  | RectGeometry
  | { type: 'line'; points: XY[] }
  | { type: 'outline'; points: XY[] }
  | { type: 'stroke'; points: XY[]; width: number; colour: string };

const points = (list: readonly XY[]) => list.map((p) => `${p.x},${p.y}`).join(' ');

/** The shape being drawn, in drawing coordinates. */
export function Draft({ shape }: { shape: DraftShape | null }) {
  if (!shape) return null;
  switch (shape.type) {
    case 'circle':
      return shape.symbol === 'square' ? (
        <rect
          data-testid="draft"
          x={shape.cx - shape.r}
          y={shape.cy - shape.r}
          width={2 * shape.r}
          height={2 * shape.r}
          className="mk-draft"
        />
      ) : (
        <circle
          data-testid="draft"
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          className={shape.symbol === 'dot' ? 'mk-draft mk-draft-dot' : 'mk-draft'}
        />
      );
    case 'rect':
      return (
        <rect
          data-testid="draft"
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          className="mk-draft"
        />
      );
    case 'line':
      return (
        <polyline data-testid="draft" points={points(shape.points)} className="mk-draft-line" />
      );
    case 'outline':
      return <polygon data-testid="draft" points={points(shape.points)} className="mk-draft" />;
    case 'stroke':
      return (
        <polyline
          data-testid="draft"
          points={points(shape.points)}
          fill="none"
          stroke={shape.colour}
          strokeOpacity={HIGHLIGHTER_ALPHA}
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
}

/** The box-select rectangle, in screen coordinates. */
export function SelectionBox({ a, b }: { a: XY; b: XY }) {
  return (
    <div
      data-testid="selection-box"
      className="pointer-events-none absolute border border-dashed border-[var(--marker-selection)] bg-[color-mix(in_oklab,var(--marker-selection)_8%,transparent)]"
      style={{
        left: Math.min(a.x, b.x),
        top: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
      }}
    />
  );
}
