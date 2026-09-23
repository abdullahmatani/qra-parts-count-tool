/**
 * Memoised selectors over the project document. Zustand selectors must return
 * stable references, so derived lists are computed with useMemo over the
 * underlying record identities.
 */
import { useMemo } from 'react';
import { orderedValues } from '@/domain/model';
import type { Drawing, Segment } from '@/domain/schema/types';
import { useProjectStore } from './project-store';
import { useUiStore } from './ui-store';

const EMPTY: never[] = [];

export function useOrderedDrawings(): Drawing[] {
  const drawings = useProjectStore((s) => s.doc?.drawings);
  const order = useProjectStore((s) => s.doc?.drawingOrder);
  return useMemo(
    () => (drawings && order ? orderedValues(drawings, order) : EMPTY),
    [drawings, order],
  );
}

export function useOrderedSegments(): Segment[] {
  const segments = useProjectStore((s) => s.doc?.segments);
  const order = useProjectStore((s) => s.doc?.segmentOrder);
  return useMemo(
    () => (segments && order ? orderedValues(segments, order) : EMPTY),
    [segments, order],
  );
}

export function useActiveSegment(): Segment | null {
  const activeSegmentId = useUiStore((s) => s.activeSegmentId);
  return useProjectStore((s) =>
    activeSegmentId ? (s.doc?.segments[activeSegmentId] ?? null) : null,
  );
}

export function useActiveDrawing(): Drawing | null {
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  return useProjectStore((s) =>
    activeDrawingId ? (s.doc?.drawings[activeDrawingId] ?? null) : null,
  );
}

/** Number of markers per drawing, recomputed when markers change. */
export function useMarkerCountsByDrawing(): Map<string, number> {
  const markers = useProjectStore((s) => s.doc?.markers);
  return useMemo(() => {
    const counts = new Map<string, number>();
    if (!markers) return counts;
    for (const marker of Object.values(markers)) {
      counts.set(marker.drawingId, (counts.get(marker.drawingId) ?? 0) + 1);
    }
    return counts;
  }, [markers]);
}
