import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { segmentAppearance } from '@/domain/palette';
import { useStage } from '@/features/stage/stage';
import { useActiveSegment, useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';

export interface RightPaneProps {
  /** The segment's set-up, while defining segments. */
  segmentDetails?: ReactNode;
  /** The segment while counting: its status and who counted and checked it. */
  segmentSummary?: ReactNode;
  countTable?: ReactNode;
  itemEditor?: ReactNode;
  notes?: ReactNode;
}

function PanelSection({
  title,
  children,
  grow,
}: {
  title: string;
  children: ReactNode;
  grow?: boolean;
}) {
  return (
    // Sections take the height of their content; the pane scrolls as a whole.
    <section
      aria-label={title}
      className={
        grow ? 'flex flex-1 shrink-0 flex-col border-t' : 'flex shrink-0 flex-col border-t'
      }
    >
      <h2 className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="px-3 pb-3">{children}</div>
    </section>
  );
}

/**
 * Right pane: the active segment selector, then what the stage needs. Defining
 * segments: the selected marker, the segment's set-up and notes. Counting: the
 * segment's status, the item, the count table and notes; no set-up.
 */
export function RightPane({
  segmentDetails,
  segmentSummary,
  countTable,
  itemEditor,
  notes,
}: RightPaneProps) {
  const { t } = useTranslation();
  const stage = useStage();
  const segments = useOrderedSegments();
  const active = useActiveSegment();
  const setActiveSegment = useUiStore((s) => s.setActiveSegment);
  const placeholder = <p className="text-sm text-muted-foreground">{t('panels.selectSegment')}</p>;

  return (
    <div className="flex h-full min-w-0 flex-col bg-panel" data-testid="right-pane">
      <div className="p-2">
        <Select
          value={active?.id ?? ''}
          onValueChange={(value) => setActiveSegment(value || null)}
          disabled={segments.length === 0}
        >
          <SelectTrigger className="w-full" aria-label={t('segments.select')}>
            <SelectValue placeholder={t('segments.noneActive')} />
          </SelectTrigger>
          <SelectContent>
            {segments.map((segment) => (
              <SelectItem key={segment.id} value={segment.id}>
                <span
                  aria-hidden="true"
                  className="size-3 rounded-sm"
                  style={{ background: segmentAppearance(segment.colour).cssVar }}
                />
                {segment.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="right-pane-sections"
        data-stage={stage}
      >
        {stage === 'segments' ? (
          <>
            {/* The selected ESDV, end flange or link first: it is what is being edited. */}
            <PanelSection title={t('panels.selection')}>
              {itemEditor ?? (
                <p className="text-sm text-muted-foreground">{t('panels.noSelection')}</p>
              )}
            </PanelSection>
            <PanelSection title={t('panels.segment')}>
              {active ? (segmentDetails ?? placeholder) : placeholder}
            </PanelSection>
          </>
        ) : (
          <>
            {active && segmentSummary && (
              <PanelSection title={t('panels.segment')}>{segmentSummary}</PanelSection>
            )}
            <PanelSection title={t('panels.item')}>
              {itemEditor ?? <p className="text-sm text-muted-foreground">{t('panels.noItem')}</p>}
            </PanelSection>
            <PanelSection title={t('panels.count')}>
              {countTable ?? (active ? null : placeholder)}
            </PanelSection>
          </>
        )}
        <PanelSection title={t('panels.notes')} grow>
          {active ? (notes ?? placeholder) : placeholder}
        </PanelSection>
      </div>
    </div>
  );
}
