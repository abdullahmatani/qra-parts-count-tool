import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { segmentAppearance } from '@/domain/palette';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';
import { useStage } from '@/features/stage/stage';

export interface SegmentListProps {
  onAdd?: () => void;
}

/**
 * Left-pane segment list; clicking a segment makes it active (SEG-06). While
 * counting, segments are not added and each shows how many items it has.
 */
export function SegmentList({ onAdd }: SegmentListProps) {
  const { t } = useTranslation();
  const stage = useStage();
  const segments = useOrderedSegments();
  const items = useProjectStore((s) => s.doc?.items);
  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (stage !== 'count') return counts;
    for (const item of Object.values(items ?? {})) {
      if (item.segmentId) counts.set(item.segmentId, (counts.get(item.segmentId) ?? 0) + 1);
    }
    return counts;
  }, [items, stage]);
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  const setActiveSegment = useUiStore((s) => s.setActiveSegment);
  const readOnly = useProjectStore((s) => s.readOnly);

  return (
    <section aria-labelledby="segments-heading" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between ps-3 pe-1 pt-2 pb-1">
        <h2
          id="segments-heading"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t('segments.title')}
        </h2>
        {onAdd && stage === 'segments' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2"
            disabled={readOnly}
            onClick={onAdd}
          >
            <Plus /> {t('segments.add')}
          </Button>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" data-testid="segment-list">
        {segments.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">{t('segments.empty')}</li>
        )}
        {segments.map((segment) => {
          const appearance = segmentAppearance(segment.colour);
          const active = segment.id === activeSegmentId;
          return (
            <li key={segment.id}>
              <button
                type="button"
                onClick={() => setActiveSegment(active ? null : segment.id)}
                aria-pressed={active}
                className={cn(
                  'flex h-row w-full items-center gap-2 rounded-md px-2 text-start text-sm hover:bg-accent',
                  active && 'bg-accent font-medium',
                )}
                title={segment.description || segment.label}
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-sm"
                  style={{ background: appearance.cssVar }}
                />
                <span className="min-w-0 flex-1 truncate">{segment.label}</span>
                {stage === 'count' && (
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {t('segments.items', { count: itemCounts.get(segment.id) ?? 0 })} ·
                  </span>
                )}
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {t(`segments.status.${segment.status}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
