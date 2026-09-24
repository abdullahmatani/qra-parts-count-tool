import { useMemo } from 'react';
import { shownSuggestions, useAssistStore } from './assist-store';

/** Roadmap #60: symbol suggestions as dashed rings, in drawing coordinates; not markers yet. */
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
    </g>
  );
}
