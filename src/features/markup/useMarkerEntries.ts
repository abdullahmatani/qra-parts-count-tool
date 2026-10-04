import { useMemo } from 'react';
import {
  isMarkerVisible,
  itemsByMarker,
  markerLabel,
  markerPaint,
} from '@/domain/markup/presentation';
import type { Marker } from '@/domain/schema/types';
import { isSegmentSetupMarker } from '@/domain/stage';
import { useStage } from '@/features/stage/stage';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useMarkerWarnings } from '@/features/count/useCount';
import type { MarkerEntry } from './marker-canvas';

/**
 * The visible markers on a drawing with their resolved appearance, in paint
 * order: highlights first; circles, ESDV double lines and end flanges on top.
 * While counting, the segments' set-up is dimmed. Recomputed only when the
 * project, stage, selection or filters change, never on pan or zoom.
 */
export function useMarkerEntries(drawingId: string): MarkerEntry[] {
  const markers = useProjectStore((s) => s.doc?.markers);
  const items = useProjectStore((s) => s.doc?.items);
  const segments = useProjectStore((s) => s.doc?.segments);
  const selection = useUiStore((s) => s.selection);
  const highlight = useUiStore((s) => s.highlighted);
  const filters = useUiStore((s) => s.filters);
  const showLabels = useUiStore((s) => s.showLabels);
  const warnings = useMarkerWarnings();
  const counting = useStage() === 'count';
  const pipeLengthCounting = useProjectStore((s) => s.doc?.settings.pipeLengthCounting ?? false);

  return useMemo(() => {
    const index = itemsByMarker(items ?? {});
    const selected = new Set(selection);
    const highlighted = new Set(highlight);
    const areas: MarkerEntry[] = [];
    const circles: MarkerEntry[] = [];
    for (const marker of Object.values(markers ?? {}) as Marker[]) {
      if (marker.drawingId !== drawingId) continue;
      const item = index.get(marker.id);
      if (!isMarkerVisible(marker, item, filters)) continue;
      const paint = markerPaint(marker, segments ?? {});
      const entry: MarkerEntry = {
        id: marker.id,
        geometry: marker.geometry,
        colour: paint.colour,
        dash: paint.dash,
        label: showLabels ? markerLabel(marker, item) : '',
        selected: selected.has(marker.id),
        highlighted: highlighted.has(marker.id),
        warning: warnings.has(marker.id),
        esdv: marker.esdv !== null,
        endFlange: marker.endFlange !== null,
        symbol: marker.style.symbol,
        outline: marker.style.outline,
        segmentId: marker.segmentId,
        dimmed: counting && isSegmentSetupMarker(marker, pipeLengthCounting),
      };
      const onTop = marker.geometry.type === 'circle' || marker.geometry.type === 'doubleLine';
      (onTop ? circles : areas).push(entry);
    }
    return [...areas, ...circles];
  }, [
    markers,
    items,
    segments,
    selection,
    highlight,
    filters,
    showLabels,
    drawingId,
    warnings,
    counting,
    pipeLengthCounting,
  ]);
}
