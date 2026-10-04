import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STAGES } from '@/domain/stage';
import type { ProjectStage } from '@/domain/schema/types';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';
import { setStageCommand, useStage } from './stage';

/**
 * The study's two steps, in the header: define the segments, then count the
 * parts. Counting starts through a check of the segments; going back is one
 * click.
 */
export function StageSwitcher() {
  const { t } = useTranslation();
  const stage = useStage();

  const choose = (next: ProjectStage) => {
    if (next === stage) return;
    if (next === 'count') useUiStore.getState().openDialog('startCount');
    else setStageCommand('segments');
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('stage.label')}
      data-testid="stage-switcher"
      data-stage={stage}
      className="flex shrink-0 items-center rounded-lg border bg-muted/50 p-0.5"
    >
      {STAGES.map((option, index) => {
        const active = option === stage;
        return (
          <div key={option} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="mx-0.5 size-3.5 text-muted-foreground" aria-hidden="true" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(option)}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-4 items-center justify-center rounded-full text-[10px] tabular-nums',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20',
                    )}
                  >
                    {index + 1}
                  </span>
                  {t(`stage.${option}`)}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">{t(`stage.${option}Hint`)}</TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
