import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewerContext } from '@/features/viewer/viewer-context';
import { useUiStore } from '@/store/ui-store';
import type { MarkerEntry, MarkerPreview } from './marker-canvas';
import { MarkerRenderer } from './marker-renderer';

export type { MarkerEntry, MarkerPreview };

/** Delay after the last view change before a scaled marker cache is redrawn. */
const SETTLE_MS = 150;

/** Canvas with every marker, redrawn whenever the view or the markers change. */
export function MarkerCanvas({
  context,
  entries,
  preview,
  hoveredId,
}: {
  context: ViewerContext;
  entries: readonly MarkerEntry[];
  preview: MarkerPreview | null;
  hoveredId: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [renderer] = useState(() => new MarkerRenderer());
  const [settleTick, setSettleTick] = useState(0);
  const settled = useRef(false);
  const showLabels = useUiStore((s) => s.showLabels);
  const { canvasSize, matrix, unitsPerPixel, view, drawingSize } = context;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = Math.round(canvasSize.width * dpr);
    const height = Math.round(canvasSize.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const stale = renderer.render(ctx, entries, {
      matrix,
      devicePixelRatio: dpr,
      unitsPerPixel,
      canvasSize,
      preview,
      hoveredId,
      showLabels,
      view,
      drawingSize,
      settled: settled.current,
    });
    settled.current = false;
    if (!stale) return;
    const timer = window.setTimeout(() => {
      settled.current = true;
      setSettleTick((n) => n + 1);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [
    renderer,
    entries,
    preview,
    hoveredId,
    matrix,
    unitsPerPixel,
    canvasSize,
    dpr,
    showLabels,
    view,
    drawingSize,
    settleTick,
  ]);

  useEffect(() => () => renderer.dispose(), [renderer]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0"
      style={{ width: canvasSize.width, height: canvasSize.height }}
      data-testid="marker-canvas"
      data-count={entries.length}
    />
  );
}

/**
 * The same markers as a visually hidden list, so screen readers (and the
 * end-to-end tests) can tell what is on the canvas.
 */
export const MarkerList = memo(function MarkerList({
  entries,
}: {
  entries: readonly MarkerEntry[];
}) {
  const { t } = useTranslation();
  return (
    <ul className="sr-only" aria-label={t('markup.layer')} data-testid="marker-list">
      {entries.map((entry) => {
        const shape = entry.esdv ? 'esdv' : entry.geometry.type;
        const kind = entry.esdv || entry.geometry.type !== 'circle' ? shape : entry.symbol;
        return (
          <li
            key={entry.id}
            data-testid="marker"
            data-marker-id={entry.id}
            data-shape={shape}
            data-symbol={entry.geometry.type === 'circle' ? entry.symbol : ''}
            data-segment-id={entry.segmentId ?? ''}
            data-colour={entry.colour}
            data-selected={entry.selected ? 'true' : 'false'}
            data-highlighted={entry.highlighted ? 'true' : 'false'}
            data-warning={entry.warning ? 'true' : 'false'}
          >
            {entry.label || t(`markup.shapes.${kind}`)}
          </li>
        );
      })}
    </ul>
  );
});
