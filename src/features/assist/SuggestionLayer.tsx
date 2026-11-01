import { useMemo } from 'react';
import { formatSize } from '@/domain/sizes';
import { shownSuggestions, useAssistStore, type Suggestion } from './assist-store';
import type { SizeSource } from './line-sizes';

/** The labels the suggestion's size was read from: one, or those that disagree. */
function sourcesOf(suggestion: Suggestion | undefined): SizeSource[] {
  const size = suggestion?.size;
  if (size?.status === 'found') return [size.source];
  if (size?.status === 'conflict') return size.sources;
  return [];
}

/**
 * Roadmap #60: symbol suggestions as dashed rings, in drawing coordinates; not
 * markers yet. The suggestion in focus points to the line number its size was
 * read from (amber where the labels on its line disagree).
 */
export function SuggestionLayer({
  drawingId,
  unitsPerPixel: upp,
}: {
  drawingId: string;
  unitsPerPixel: number;
}) {
  const forDrawing = useAssistStore((s) => s.drawingId === drawingId);
  const suggestions = useAssistStore((s) => s.suggestions);
  const minScore = useAssistStore((s) => s.minScore);
  const index = useAssistStore((s) => s.index);
  const shown = useMemo(() => shownSuggestions({ suggestions, minScore }), [suggestions, minScore]);
  if (!forDrawing || shown.length === 0) return null;
  const current = Math.min(index, shown.length - 1);
  const focus = shown[current];
  const conflict = focus?.size.status === 'conflict';
  const colour = conflict ? 'var(--marker-warning)' : '#7c3aed';
  return (
    <g data-testid="suggestions" pointerEvents="none">
      {shown.map((s, i) => (
        <circle
          key={s.id}
          data-testid="suggestion"
          data-current={i === current ? 'true' : 'false'}
          data-cx={Math.round(s.cx)}
          data-cy={Math.round(s.cy)}
          data-score={Math.round(s.score * 100)}
          data-size={s.size.status}
          data-size-value={s.size.status === 'found' ? formatSize(s.size.size) : undefined}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill="#8b5cf6"
          fillOpacity={i === current ? 0.18 : 0.06}
          stroke="#7c3aed"
          strokeWidth={(i === current ? 3 : 1.5) * upp}
          strokeDasharray={`${6 * upp} ${4 * upp}`}
        />
      ))}
      {focus &&
        sourcesOf(focus).map((source, i) => {
          const pad = 2 * upp;
          const { x, y, width, height } = source.rect;
          // From the ring to the nearest point of the label.
          const tx = Math.min(Math.max(focus.cx, x), x + width);
          const ty = Math.min(Math.max(focus.cy, y), y + height);
          const d = Math.hypot(tx - focus.cx, ty - focus.cy);
          const fx = d > focus.r ? focus.cx + ((tx - focus.cx) / d) * focus.r : tx;
          const fy = d > focus.r ? focus.cy + ((ty - focus.cy) / d) * focus.r : ty;
          return (
            <g key={i} data-testid="suggestion-size-source" data-text={source.text}>
              {d > focus.r && (
                <line
                  x1={fx}
                  y1={fy}
                  x2={tx}
                  y2={ty}
                  stroke={colour}
                  strokeOpacity={0.7}
                  strokeWidth={1.25 * upp}
                  strokeDasharray={`${3 * upp} ${3 * upp}`}
                />
              )}
              <rect
                x={x - pad}
                y={y - pad}
                width={width + 2 * pad}
                height={height + 2 * pad}
                rx={2 * upp}
                fill={colour}
                fillOpacity={0.08}
                stroke={colour}
                strokeWidth={1.5 * upp}
              />
            </g>
          );
        })}
    </g>
  );
}
