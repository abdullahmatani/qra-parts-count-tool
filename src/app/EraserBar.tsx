import { Eraser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { HIGHLIGHTER_PENS, type HighlighterPen } from '@/domain/markup/highlighter';
import { segmentAppearance } from '@/domain/palette';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

/** Eraser sizes as they look in the bar, in px: as wide as the pens. */
const SAMPLE: Record<HighlighterPen, number> = { fine: 4, medium: 7, broad: 11 };

/**
 * Takes the equipment bar's place while the Eraser tool is in use: whose
 * highlighting it rubs out (any segment's, or only the active segment's),
 * and how big it is.
 */
export function EraserBar() {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const size = useUiStore((s) => s.eraserSize);
  const setSize = useUiStore((s) => s.setEraserSize);
  const activeOnly = useUiStore((s) => s.eraserActiveSegmentOnly);
  const setActiveOnly = useUiStore((s) => s.setEraserActiveSegmentOnly);
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  const segment = useProjectStore((s) =>
    activeSegmentId ? (s.doc?.segments[activeSegmentId] ?? null) : null,
  );
  const colour =
    activeOnly && segment ? segmentAppearance(segment.colour).cssVar : 'var(--muted-foreground)';
  const target = !activeOnly
    ? t('eraser.all')
    : segment
      ? t('eraser.segment', { segment: segment.label })
      : t('eraser.unassigned');

  return (
    <div
      role="toolbar"
      aria-label={t('eraser.label')}
      data-testid="eraser-bar"
      className="flex h-10 shrink-0 items-center gap-2 border-b bg-panel px-2"
    >
      <Eraser className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span
        className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap"
        data-testid="eraser-target"
      >
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-sm"
          style={{ background: colour }}
        />
        <span className="truncate">{target}</span>
      </span>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <span className="shrink-0 text-xs text-muted-foreground">{t('eraser.size')}</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={size}
        onValueChange={(value) => value && setSize(value as HighlighterPen)}
        disabled={readOnly}
        aria-label={t('eraser.size')}
        className="gap-0.5"
      >
        {HIGHLIGHTER_PENS.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            data-testid={`eraser-${option}`}
            className="gap-1.5 px-2 text-xs aria-checked:ring-1 aria-checked:ring-primary/30 aria-checked:ring-inset"
          >
            <span aria-hidden="true" className="flex w-3 shrink-0 items-center justify-center">
              <span
                className="shrink-0 rounded-full border border-foreground/60"
                style={{ width: SAMPLE[option], height: SAMPLE[option] }}
              />
            </span>
            {t(`highlighter.pens.${option}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <Toggle
        size="sm"
        pressed={activeOnly}
        onPressedChange={setActiveOnly}
        disabled={readOnly}
        title={t('eraser.activeOnlyHint')}
        data-testid="eraser-active-only"
        className="shrink-0 px-2 text-xs"
      >
        {t('eraser.activeOnly')}
      </Toggle>

      <span className="ms-auto hidden min-w-0 truncate ps-2 text-xs text-muted-foreground lg:inline">
        {t('eraser.hint')}
      </span>
    </div>
  );
}
