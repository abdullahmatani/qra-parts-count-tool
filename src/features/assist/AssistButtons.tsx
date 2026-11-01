import { Loader2, Ruler, ScanSearch } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hasExamples } from '@/domain/symbol-examples';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useAssistStore } from './assist-store';
import { fillSizesFromLines, itemsWithoutSize, useFillSizesStore } from './fill-sizes';
import { identifyEquipment } from './find-similar';

/**
 * Identify equipment: searches the active drawing for every kind of symbol
 * counted so far, and reads each one's size from its line number. Available
 * once something is counted, on any drawing.
 */
export function IdentifyButton() {
  const { t } = useTranslation();
  const drawingId = useUiStore((s) => s.activeDrawingId);
  const readOnly = useProjectStore((s) => s.readOnly);
  const markers = useProjectStore((s) => s.doc?.markers);
  const items = useProjectStore((s) => s.doc?.items);
  const searching = useAssistStore((s) => s.status === 'searching');
  const counted = useMemo(
    () => !!markers && !!items && hasExamples({ markers, items }),
    [markers, items],
  );
  const disabled = readOnly || !drawingId || !counted || searching;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button shows no tooltip: the span does. */}
        <span className="shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={disabled}
            aria-busy={searching}
            data-testid="identify-equipment"
            onClick={() => drawingId && void identifyEquipment(drawingId)}
          >
            {searching ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            {t('assist.identify')}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {counted ? t('assist.identifyHint') : t('assist.identifyNeedsExample')}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Fill sizes: the counted items on the active drawing with no size take the
 * size of their line, read from its line number; the rest stay pending.
 */
export function FillSizesButton() {
  const { t } = useTranslation();
  const drawingId = useUiStore((s) => s.activeDrawingId);
  const readOnly = useProjectStore((s) => s.readOnly);
  const doc = useProjectStore((s) => s.doc);
  const busy = useFillSizesStore((s) => s.busy);
  // Recounted when the items change.
  const missing = useMemo(
    () => (doc && drawingId ? itemsWithoutSize(drawingId).length : 0),
    [doc, drawingId],
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={readOnly || !drawingId || busy || missing === 0}
            aria-busy={busy}
            data-testid="fill-sizes"
            onClick={() => drawingId && void fillSizesFromLines(drawingId)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Ruler />}
            {t('lineSizes.button')}
            {missing > 0 && (
              <span className="rounded bg-marker-warning/15 px-1 text-[0.7rem] text-marker-warning tabular-nums">
                {missing}
              </span>
            )}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {missing > 0 ? t('lineSizes.hint') : t('lineSizes.nothingToFill')}
      </TooltipContent>
    </Tooltip>
  );
}
