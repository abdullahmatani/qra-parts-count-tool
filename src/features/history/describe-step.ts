import type { TFunction } from 'i18next';
import { ENTITY_KINDS, type StepSummary } from './history-changes';

/** Drawing names shown in a step's summary before the rest are counted. */
const DRAWING_NAMES = 2;

/** One line on what a step touches, e.g. "Removes 3 markers, 3 count items · PEFS-1001". */
export function describeStep(summary: StepSummary, t: TFunction): string {
  const parts: string[] = [];
  for (const change of ['added', 'removed', 'changed'] as const) {
    const list = ENTITY_KINDS.flatMap((kind) => {
      const count = summary.counts[change][kind];
      return count ? [t(`history.kinds.${kind}`, { count })] : [];
    });
    if (change === 'changed') list.push(...summary.areas.map((area) => t(`history.areas.${area}`)));
    if (list.length) parts.push(t(`history.summary.${change}`, { list: list.join(', ') }));
  }
  const { drawings } = summary;
  if (drawings.length) {
    const names = drawings.slice(0, DRAWING_NAMES).join(', ');
    parts.push(
      drawings.length > DRAWING_NAMES
        ? t('history.summary.moreDrawings', {
            drawings: names,
            count: drawings.length - DRAWING_NAMES,
          })
        : names,
    );
  }
  return parts.join(' · ');
}
