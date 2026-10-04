import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { segmentAppearance } from '@/domain/palette';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

/**
 * The bar under the toolbar for tools with no options: the segment new
 * markers go to, in its colour, and how to use the tool.
 */
export function ToolHintBar({ icon: Icon, hint }: { icon: LucideIcon; hint: string }) {
  const { t } = useTranslation();
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  const segment = useProjectStore((s) =>
    activeSegmentId ? (s.doc?.segments[activeSegmentId] ?? null) : null,
  );

  return (
    <div
      role="toolbar"
      aria-label={t('stage.bar.label')}
      data-testid="tool-hint-bar"
      className="flex h-10 shrink-0 items-center gap-2 border-b bg-panel px-2"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap">
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-sm"
          style={{
            background: segment
              ? segmentAppearance(segment.colour).cssVar
              : 'var(--muted-foreground)',
          }}
        />
        {segment ? segment.label : t('segments.noneActive')}
      </span>
      <span className="min-w-0 truncate ps-2 text-xs text-muted-foreground" data-testid="tool-hint">
        {hint}
      </span>
    </div>
  );
}
