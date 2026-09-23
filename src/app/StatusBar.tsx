import { AlertTriangle, Filter, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/store/ui-store';

export interface StatusBarProps {
  warningCount?: number;
  onShowWarnings?: () => void;
  filterChips?: ReactNode;
}

/** Status bar: zoom · cursor coordinates · warnings · filter chips (FDS section 6). */
export function StatusBar({ warningCount = 0, onShowWarnings, filterChips }: StatusBarProps) {
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
      <button
        type="button"
        onClick={onShowWarnings}
        disabled={!onShowWarnings}
        className="flex items-center gap-1 rounded px-1 hover:bg-accent disabled:hover:bg-transparent"
        data-testid="status-warnings"
      >
        <AlertTriangle className={warningCount > 0 ? 'size-3.5 text-marker-warning' : 'size-3.5'} />
        {warningCount > 0 ? t('status.warnings', { count: warningCount }) : t('status.noWarnings')}
      </button>
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
