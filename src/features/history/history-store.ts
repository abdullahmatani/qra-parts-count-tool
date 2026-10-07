/**
 * The step of the history the user is pointing at in the undo or redo menu,
 * and what going back or forward to it would change. The drawing, the
 * segment list and the drawing list grey out what it touches. Transient: it
 * lasts while a history menu is open.
 */
import { create } from 'zustand';
import type { HistoryPreview } from './history-changes';

interface HistoryPreviewState {
  preview: HistoryPreview | null;
  setPreview: (preview: HistoryPreview | null) => void;
}

export const useHistoryPreviewStore = create<HistoryPreviewState>()((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));

const NONE: ReadonlySet<string> = new Set();

/** Markers the previewed steps change or take away. */
export function useChangingMarkers(): ReadonlySet<string> {
  return useHistoryPreviewStore((s) => s.preview?.changing ?? NONE);
}

/** Segments the previewed steps change or take away. */
export function useChangingSegments(): ReadonlySet<string> {
  return useHistoryPreviewStore((s) => s.preview?.segments ?? NONE);
}

/** Drawings the previewed steps change or take away. */
export function useChangingDrawings(): ReadonlySet<string> {
  return useHistoryPreviewStore((s) => s.preview?.drawings ?? NONE);
}
