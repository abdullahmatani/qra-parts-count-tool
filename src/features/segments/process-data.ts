/**
 * A segment's process data at a glance: whether any is entered, and the main
 * values in one line for the collapsed section of the segment panel.
 */
import type { Segment, Units } from '@/domain/schema/types';

type ProcessData = Pick<
  Segment,
  | 'equipment'
  | 'fluid'
  | 'phase'
  | 'streamNumber'
  | 'pressure'
  | 'temperature'
  | 'h2sMoleFraction'
  | 'molecularWeightOrDensity'
>;

export function hasProcessData(segment: ProcessData): boolean {
  return (
    [segment.equipment, segment.fluid, segment.phase, segment.streamNumber].some((s) => s.trim()) ||
    [
      segment.pressure,
      segment.temperature,
      segment.h2sMoleFraction,
      segment.molecularWeightOrDensity,
    ].some((v) => v !== null)
  );
}

/** "Gas · Liquid · 45 barg · 60 °C · V-100 inlet separator"; empty when none of these is set. */
export function processSummary(
  segment: ProcessData,
  units: Pick<Units, 'pressure' | 'temperature'>,
): string {
  const withUnit = (value: number | null, unit: string) =>
    value === null ? '' : `${value} ${unit}`.trim();
  return [
    segment.fluid,
    segment.phase,
    withUnit(segment.pressure, units.pressure),
    withUnit(segment.temperature, units.temperature),
    segment.equipment,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
}
