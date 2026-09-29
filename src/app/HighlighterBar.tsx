import { Highlighter, Magnet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { HIGHLIGHTER_PENS, type HighlighterPen } from '@/domain/markup/highlighter';
import { HIGHLIGHTER_ALPHA, segmentAppearance } from '@/domain/palette';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { AutoTraceButton } from './AutoTraceButton';

/** Pen sizes as they look in the bar, in px. */
const SAMPLE: Record<HighlighterPen, number> = { fine: 3, medium: 6, broad: 11 };

/**
 * Takes the equipment bar's place while the Highlighter tool is in use: which
 * segment the strokes go to (in its colour), the pen they are painted with,
 * whether strokes follow the drawing's lines, and the auto trace.
 */
export function HighlighterBar() {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const pen = useUiStore((s) => s.highlighterPen);
  const setPen = useUiStore((s) => s.setHighlighterPen);
  const followsLines = useUiStore((s) => s.highlighterFollowsLines);
  const setFollowsLines = useUiStore((s) => s.setHighlighterFollowsLines);
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  const segment = useProjectStore((s) =>
    activeSegmentId ? (s.doc?.segments[activeSegmentId] ?? null) : null,
  );
  const colour = segment ? segmentAppearance(segment.colour).cssVar : 'var(--muted-foreground)';

  return (
    <div
      role="toolbar"
      aria-label={t('highlighter.label')}
      data-testid="highlighter-bar"
      className="flex h-10 shrink-0 items-center gap-2 border-b bg-panel px-2"
    >
      <Highlighter className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span
        className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap"
        data-testid="highlighter-segment"
      >
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-sm"
          style={{ background: colour }}
        />
        <span className="truncate">
          {segment
            ? t('highlighter.segment', { segment: segment.label })
            : t('highlighter.noSegment')}
        </span>
      </span>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <span className="shrink-0 text-xs text-muted-foreground">{t('highlighter.pen')}</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={pen}
        onValueChange={(value) => value && setPen(value as HighlighterPen)}
        disabled={readOnly}
        aria-label={t('highlighter.pen')}
        className="gap-0.5"
      >
        {HIGHLIGHTER_PENS.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            data-testid={`pen-${option}`}
            className="gap-1.5 px-2 text-xs aria-checked:ring-1 aria-checked:ring-primary/30 aria-checked:ring-inset"
          >
            <span
              aria-hidden="true"
              className="w-4 shrink-0 rounded-full"
              style={{ height: SAMPLE[option], background: colour, opacity: HIGHLIGHTER_ALPHA * 2 }}
            />
            {t(`highlighter.pens.${option}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <Toggle
        size="sm"
        pressed={followsLines}
        onPressedChange={setFollowsLines}
        disabled={readOnly}
        title={t('highlighter.followLinesHint')}
        data-testid="highlighter-follow-lines"
        className="shrink-0 gap-1.5 px-2 text-xs"
      >
        <Magnet /> {t('highlighter.followLines')}
      </Toggle>
      <AutoTraceButton />

      <span className="ms-auto hidden min-w-0 truncate ps-2 text-xs text-muted-foreground lg:inline">
        {t('highlighter.hint')}
      </span>
    </div>
  );
}
