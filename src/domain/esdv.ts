/**
 * ESDVs: how they are drawn (SEG-01) and the boundary rule (SEG-08), which
 * segment an ESDV on a segment boundary is counted in. The rule is chosen at
 * project setup with no default, and each ESDV may override it.
 */
import type { EsdvBoundaryRule, EsdvData, Marker, MarkerShape, SizeUnit } from './schema/types';

/** How an ESDV is drawn: a ring round the valve, or a double line across the pipe. */
export type EsdvShape = Extract<MarkerShape, 'circle' | 'doubleLine'>;

export const ESDV_SHAPES: readonly EsdvShape[] = ['circle', 'doubleLine'];

export function newEsdvData(sizeUnit: SizeUnit): EsdvData {
  return {
    tag: '',
    nominalSize: null,
    sizeUnit,
    upstreamSegmentId: null,
    downstreamSegmentId: null,
    boundaryRuleOverride: null,
  };
}

/** The rule that applies to this ESDV: its override, or the project rule. */
export function effectiveBoundaryRule(
  esdv: Pick<EsdvData, 'boundaryRuleOverride'>,
  projectRule: EsdvBoundaryRule | null,
): EsdvBoundaryRule | null {
  return esdv.boundaryRuleOverride ?? projectRule;
}

/**
 * Segments that count this ESDV as an item under the boundary rule. A missing
 * side counts nowhere; with no rule at all nothing is counted and the
 * pre-export check reports it.
 */
export function esdvCountingSegmentIds(
  marker: Pick<Marker, 'esdv'>,
  projectRule: EsdvBoundaryRule | null,
): string[] {
  const esdv = marker.esdv;
  if (!esdv) return [];
  const rule = effectiveBoundaryRule(esdv, projectRule);
  const up = esdv.upstreamSegmentId;
  const down = esdv.downstreamSegmentId;
  const sides =
    rule === 'upstream' ? [up] : rule === 'downstream' ? [down] : rule === 'both' ? [up, down] : [];
  return [...new Set(sides.filter((id): id is string => id !== null))];
}
