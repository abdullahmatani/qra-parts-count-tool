import { useMemo } from 'react';
import { doubleLineBand, doubleLineStrokes, symbolPolygon } from '@/domain/markup/geometry';
import { HISTORY_PREVIEW_GREY } from '@/domain/palette';
import type { Marker, Point } from '@/domain/schema/types';
import { useHistoryPreviewStore } from './history-store';

/** Outlines drawn at most: enough to show where a large step lands, cheap to draw. */
const MAX_GHOSTS = 2000;

const pointList = (points: readonly (Point | { x: number; y: number })[]) =>
  points.map((p) => ('x' in p ? `${p.x},${p.y}` : `${p[0]},${p[1]}`)).join(' ');

function GhostShape({ marker, upp }: { marker: Marker; upp: number }) {
  const g = marker.geometry;
  switch (g.type) {
    case 'circle': {
      const polygon = symbolPolygon(g, marker.style);
      return polygon ? (
        <polygon points={pointList(polygon)} />
      ) : (
        <circle cx={g.cx} cy={g.cy} r={g.r} />
      );
    }
    case 'rect':
      return <rect x={g.x} y={g.y} width={g.width} height={g.height} />;
    case 'polyline':
      return <polyline points={pointList(g.points)} />;
    case 'stroke':
      // The pen's width, faint, with the dashed outline along its middle.
      return (
        <>
          <polyline
            points={pointList(g.points)}
            strokeWidth={g.width}
            strokeOpacity={0.3}
            strokeDasharray="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline points={pointList(g.points)} />
        </>
      );
    case 'doubleLine':
      if (marker.endFlange) return <polygon points={pointList(doubleLineBand(g))} />;
      return (
        <>
          {doubleLineStrokes(g).map(([a, b], i) => (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={2.5 * upp} />
          ))}
        </>
      );
  }
}

/**
 * Markers as the undo or redo steps pointed at in a history menu would leave
 * them, where they come back or change shape: dashed grey outlines, in drawing
 * coordinates. What they replace is greyed out on the marker canvas.
 */
export function HistoryGhostLayer({
  drawingId,
  unitsPerPixel: upp,
}: {
  drawingId: string;
  unitsPerPixel: number;
}) {
  const ghosts = useHistoryPreviewStore((s) => s.preview?.ghosts);
  const here = useMemo(
    () => (ghosts ?? []).filter((m) => m.drawingId === drawingId).slice(0, MAX_GHOSTS),
    [ghosts, drawingId],
  );
  if (here.length === 0) return null;
  return (
    <g
      data-testid="history-ghosts"
      data-count={here.length}
      pointerEvents="none"
      fill="none"
      stroke={HISTORY_PREVIEW_GREY}
      strokeWidth={2 * upp}
      strokeDasharray={`${6 * upp} ${4 * upp}`}
    >
      {here.map((marker) => (
        <g key={marker.id} data-testid="history-ghost" data-marker-id={marker.id}>
          <GhostShape marker={marker} upp={upp} />
        </g>
      ))}
    </g>
  );
}
