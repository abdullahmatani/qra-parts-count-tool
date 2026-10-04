import { AlertTriangle, Filter, X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { MarkerWarning } from '@/domain/count/count';
import { showMarker } from '@/features/segments/segment-commands';
import { useStage, useStageWarnings } from '@/features/stage/stage';
import { useUiStore } from '@/store/ui-store';

export interface StatusBarProps {
  filterChips?: ReactNode;
}

const KINDS: readonly MarkerWarning[] = ['unassigned', 'incomplete', 'duplicate'];

/**
 * The marker warnings that matter in the stage: set-up in no segment while
 * defining segments; the equipment's while counting. A click goes to the
 * next marker with a warning and highlights them all.
 */
function StageWarningsButton() {
  const { t } = useTranslation();
  const stage = useStage();
  const { markerIds, counts } = useStageWarnings();
  const next = useRef(0);
  const count = markerIds.length;

  const show = () => {
    if (!count) return;
    const id = markerIds[next.current % count]!;
    next.current += 1;
    showMarker(id);
    useUiStore.getState().setHighlighted(markerIds);
  };

  const detail = KINDS.filter((kind) => counts[kind] > 0)
    .map((kind) => t(`status.kinds.${kind}`, { count: counts[kind] }))
    .join(' · ');

  return (
    <button
      type="button"
      onClick={show}
      disabled={count === 0}
      title={count ? `${detail}. ${t('status.showNext')}` : undefined}
      className="flex items-center gap-1 rounded px-1 hover:bg-accent disabled:hover:bg-transparent"
      data-testid="status-warnings"
      data-stage={stage}
    >
      <AlertTriangle className={count > 0 ? 'size-3.5 text-marker-warning' : 'size-3.5'} />
      {count === 0
        ? t('status.noWarnings')
        : stage === 'segments'
          ? t('status.setupWarnings', { count })
          : t('status.warnings', { count })}
    </button>
  );
}

/** Status bar: zoom · cursor coordinates · warnings · filter chips (FDS section 6). */
export function StatusBar({ filterChips }: StatusBarProps) {
  const { t } = useTranslation();
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const viewport = useUiStore((s) => (activeDrawingId ? s.viewports[activeDrawingId] : undefined));
  const cursor = useUiStore((s) => s.cursor);
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const filtersActive =
    filters.hiddenSegments.length > 0 ||
    filters.hiddenTypes.length > 0 ||
    filters.showUnassignedOnly;

  return (
    <footer
      className="flex h-7 shrink-0 items-center gap-4 border-t bg-panel px-3 text-xs text-muted-foreground"
      data-testid="status-bar"
    >
      <span className="w-24 tabular-nums" data-testid="status-zoom">
        {viewport ? t('status.zoom', { zoom: Math.round(viewport.zoom * 100) }) : '—'}
      </span>
      <span className="w-40 font-mono tabular-nums" data-testid="status-cursor">
        {cursor ? t('status.cursor', { x: cursor.x.toFixed(1), y: cursor.y.toFixed(1) }) : ''}
      </span>
      <StageWarningsButton />
      <div className="ms-auto flex items-center gap-1">
        {filterChips}
        {filtersActive && (
          <>
            <Filter className="size-3.5" aria-label={t('status.filters')} />
            <Button
              size="sm"
              variant="ghost"
              className="h-5 gap-1 px-1.5 text-xs"
              onClick={() =>
                setFilters({ hiddenSegments: [], hiddenTypes: [], showUnassignedOnly: false })
              }
            >
              <X className="size-3" />
              {t('status.clearFilters')}
            </Button>
          </>
        )}
      </div>
    </footer>
  );
}
