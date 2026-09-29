import { Loader2, WandSparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Kbd } from '@/components/ui/kbd';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hasTraceBoundaries } from '@/domain/markup/trace-boundaries';
import { toggleAutoTrace } from '@/features/trace/auto-trace-actions';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

/**
 * Auto trace: takes the highlighter and highlights the active segment's
 * pipework out to its ESDVs and end flanges; while it is on, a click on a pipe
 * traces that pipe. Available once the drawing has an ESDV, an end flange or a
 * drawing link for the trace to run out to.
 */
export function AutoTraceButton() {
  const { t } = useTranslation();
  const on = useUiStore((s) => s.tool === 'highlighter' && s.autoTrace);
  const tracing = useUiStore((s) => s.tracing);
  const drawingId = useUiStore((s) => s.activeDrawingId);
  const readOnly = useProjectStore((s) => s.readOnly);
  const markers = useProjectStore((s) => s.doc?.markers);
  const links = useProjectStore((s) => s.doc?.links);
  const available = useMemo(
    () => !!drawingId && !!markers && !!links && hasTraceBoundaries({ markers, links }, drawingId),
    [drawingId, markers, links],
  );
  const disabled = readOnly || tracing || (!available && !on);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button shows no tooltip: the span does. */}
        <span className="shrink-0">
          <Toggle
            size="sm"
            pressed={on}
            onPressedChange={(pressed) => toggleAutoTrace(pressed)}
            disabled={disabled}
            aria-busy={tracing}
            data-testid="auto-trace"
            className="gap-1.5 px-2 text-xs"
          >
            {tracing ? <Loader2 className="animate-spin" /> : <WandSparkles />}
            {t('autoTrace.button')}
          </Toggle>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {available ? t('autoTrace.hint') : t('autoTrace.needsBoundary')} <Kbd>T</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
