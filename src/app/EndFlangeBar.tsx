import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { END_FLANGE_DESTINATIONS } from '@/domain/end-flange';
import type { EndFlangeDestination } from '@/domain/schema/types';
import { EndFlangeIcon } from '@/features/markup/EndFlangeIcon';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { AutoTraceButton } from './AutoTraceButton';

/**
 * Takes the equipment bar's place while the End flange tool is in use: where
 * the pipe goes beyond the next end flange (closed drain, flare or another end
 * point), and the auto trace, which runs to the ESDVs and end flanges.
 */
export function EndFlangeBar() {
  const { t } = useTranslation();
  const readOnly = useProjectStore((s) => s.readOnly);
  const destination = useUiStore((s) => s.endFlangeDestination);
  const setDestination = useUiStore((s) => s.setEndFlangeDestination);

  return (
    <div
      role="toolbar"
      aria-label={t('endFlangeBar.label')}
      data-testid="end-flange-bar"
      className="flex h-10 shrink-0 items-center gap-2 border-b bg-panel px-2"
    >
      <EndFlangeIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs text-muted-foreground">
        {t('endFlangeBar.destination')}
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        value={destination}
        onValueChange={(value) => value && setDestination(value as EndFlangeDestination)}
        disabled={readOnly}
        aria-label={t('endFlangeBar.destination')}
        className="gap-0.5"
      >
        {END_FLANGE_DESTINATIONS.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            data-testid={`end-flange-${option}`}
            className="px-2 text-xs aria-checked:ring-1 aria-checked:ring-primary/30 aria-checked:ring-inset"
          >
            {t(`markup.endFlange.destinations.${option}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-5!" />
      <AutoTraceButton />
      <Separator orientation="vertical" className="mx-1 h-5!" />

      <span
        className="min-w-0 truncate text-xs text-muted-foreground"
        data-testid="end-flange-bar-hint"
      >
        {t('endFlangeBar.hint')}
      </span>
    </div>
  );
}
