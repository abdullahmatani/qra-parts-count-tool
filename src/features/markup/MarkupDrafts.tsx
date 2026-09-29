import { doubleLineBand, doubleLineStrokes, type XY } from '@/domain/markup/geometry';
import { HIGHLIGHTER_ALPHA } from '@/domain/palette';
import type {
  CircleGeometry,
  DoubleLineGeometry,
  MarkerSymbol,
  RectGeometry,
} from '@/domain/schema/types';

/**
 * A shape being drawn: a circle (drawn as the chosen symbol), rectangle,
 * ESDV double line or end flange bar geometry, the points of a line run, a free-form outline
 * being traced, a highlighter stroke being painted (as it will look, in
 * its segment's colour), or the path the highlighter's line magnet is
 * tracing, dashed, with a ring where it holds on to the line.
 */
export type DraftShape =
  | (CircleGeometry & { symbol?: MarkerSymbol })
  | RectGeometry
  | (DoubleLineGeometry & { bar?: boolean })
  | { type: 'line'; points: XY[] }
  | { type: 'outline'; points: XY[] }
  | { type: 'stroke'; points: XY[]; width: number; colour: string }
  | { type: 'trace'; points: XY[]; end: XY | null; colour: string };

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
    case 'doubleLine':
      if (shape.bar) {
        return (
          <polygon
            data-testid="draft"
            points={points(doubleLineBand(shape))}
            className="mk-draft"
          />
        );
      }
      return (
        <g data-testid="draft" className="mk-draft-double">
          {doubleLineStrokes(shape).map(([a, b], i) => (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          ))}
        </g>
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
    case 'trace':
      return (
        <g data-testid="trace" data-points={shape.points.length}>
          <polyline points={points(shape.points)} className="mk-trace-halo" />
          <polyline points={points(shape.points)} className="mk-trace" stroke={shape.colour} />
          {shape.end && (
            <circle
              data-testid="trace-end"
              cx={shape.end.x}
              cy={shape.end.y}
              className="mk-trace-end"
              stroke={shape.colour}
            />
          )}
        </g>
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
