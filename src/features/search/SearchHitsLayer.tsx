import { useSearchStore } from './search-store';
import { useSearchHits } from './useSearchHits';

/** DRW-08: search hits as highlighted boxes, in drawing coordinates. */
export function SearchHitsLayer({
  drawingId,
  unitsPerPixel: upp,
}: {
  drawingId: string;
  unitsPerPixel: number;
}) {
  const { hits } = useSearchHits(drawingId);
  const index = useSearchStore((s) => s.index);
  if (hits.length === 0) return null;
  const current = Math.min(index, hits.length - 1);
  const pad = 2 * upp;
  return (
    <g data-testid="search-hits" pointerEvents="none">
      {hits.map((hit, i) => (
        <rect
          key={`${hit.x}:${hit.y}:${i}`}
          data-testid="search-hit"
          data-current={i === current ? 'true' : 'false'}
          x={hit.x - pad}
          y={hit.y - pad}
          width={hit.width + 2 * pad}
          height={hit.height + 2 * pad}
          fill="#facc15"
          fillOpacity={i === current ? 0.45 : 0.3}
          stroke={i === current ? '#ea580c' : '#ca8a04'}
          strokeWidth={(i === current ? 2.5 : 1) * upp}
        />
      ))}
    </g>
  );
}
