import type { XY } from '@/domain/markup/geometry';
import type { MarkerGeometry } from '@/domain/schema/types';

/** A shape being drawn: a circle or rectangle geometry, or the points of a line run. */
export type DraftShape =
  Exclude<MarkerGeometry, { type: 'polyline' }> | { type: 'line'; points: XY[] };

/** The shape being drawn, in drawing coordinates. */
export function Draft({ shape }: { shape: DraftShape | null }) {
  if (!shape) return null;
  switch (shape.type) {
    case 'circle':
      return (
        <circle data-testid="draft" cx={shape.cx} cy={shape.cy} r={shape.r} className="mk-draft" />
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
        <polyline
          data-testid="draft"
          points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')}
          className="mk-draft-line"
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
