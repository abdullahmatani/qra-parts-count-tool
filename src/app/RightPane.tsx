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
import { useActiveSegment, useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';

export interface RightPaneProps {
  segmentDetails?: ReactNode;
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
    <section
      aria-label={title}
      className={grow ? 'flex min-h-0 flex-1 flex-col border-t' : 'flex flex-col border-t'}
    >
      <h2 className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
    </section>
  );
}

/** Right pane: active segment selector, segment details, count table, item editor and notes. */
export function RightPane({ segmentDetails, countTable, itemEditor, notes }: RightPaneProps) {
  const { t } = useTranslation();
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PanelSection title={t('panels.segment')}>
          {active ? (segmentDetails ?? placeholder) : placeholder}
        </PanelSection>
        <PanelSection title={t('panels.count')}>
          {countTable ?? (active ? null : placeholder)}
        </PanelSection>
        <PanelSection title={t('panels.item')}>
          {itemEditor ?? <p className="text-sm text-muted-foreground">{t('panels.noItem')}</p>}
        </PanelSection>
        <PanelSection title={t('panels.notes')} grow>
          {active ? (notes ?? placeholder) : placeholder}
        </PanelSection>
      </div>
    </div>
  );
}
