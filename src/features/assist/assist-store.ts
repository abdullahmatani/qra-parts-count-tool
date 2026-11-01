/**
 * Symbol suggestions under review (roadmap #60). Kept in memory only: a
 * suggestion becomes part of the count when, and only when, the user accepts
 * it, which turns it into an ordinary marker.
 */
import { create } from 'zustand';
import type { LineSize } from './line-sizes';

/**
 * The size a suggestion would be counted at: read from the line it is on
 * (found, in conflict or none, which leaves it pending for the user), still
 * being read, or none at all for a type that needs no size.
 */
export type SuggestionSize = LineSize | { status: 'reading' } | { status: 'unsized' };

export interface Suggestion {
  id: string;
  /** A circle ringing the candidate symbol, in drawing coordinates. */
  cx: number;
  cy: number;
  r: number;
  /** How closely it matches the example, 0–1. */
  score: number;
  /** The counted marker it looks like: it is counted as that marker's type and drawn with its shape. */
  exampleId: string;
  size: SuggestionSize;
}

export type AssistStatus = 'idle' | 'searching' | 'done' | 'error';

/** Similar to one counted marker, or every kind of symbol counted so far. */
export type AssistMode = 'similar' | 'identify';

/** Similarity thresholds offered, strictest first. */
export const SIMILARITY_LEVELS = [0.9, 0.8, 0.75, 0.7, 0.6] as const;
/**
 * On the sample and CAD fixture sheets, 75 % finds every symbol and suggests one
 * false one (docs/spikes/symbol-detection.md).
 */
export const DEFAULT_SIMILARITY = 0.75;

interface AssistState {
  status: AssistStatus;
  mode: AssistMode;
  drawingId: string | null;
  /** While searching for several examples: how many are done. */
  progress: { done: number; total: number } | null;
  /** Every candidate still to review, best first; the list shows those at `minScore` or above. */
  suggestions: Suggestion[];
  minScore: number;
  /** The suggestion in focus, within the shown list. */
  index: number;
  error: string | null;
  start: (drawingId: string, mode: AssistMode) => void;
  setProgress: (done: number, total: number) => void;
  finish: (suggestions: Suggestion[]) => void;
  /** Sets the sizes read for suggestions (by id). */
  setSizes: (sizes: ReadonlyMap<string, SuggestionSize>) => void;
  fail: (error: string) => void;
  remove: (ids: readonly string[]) => void;
  setIndex: (index: number) => void;
  setMinScore: (minScore: number) => void;
  close: () => void;
}

const idle = {
  status: 'idle' as AssistStatus,
  mode: 'similar' as AssistMode,
  drawingId: null,
  progress: null,
  suggestions: [],
  index: 0,
  error: null,
};

export const useAssistStore = create<AssistState>()((set) => ({
  ...idle,
  minScore: DEFAULT_SIMILARITY,
  start: (drawingId, mode) => set({ ...idle, status: 'searching', drawingId, mode }),
  setProgress: (done, total) => set({ progress: { done, total } }),
  finish: (suggestions) => set({ status: 'done', suggestions, index: 0, progress: null }),
  setSizes: (sizes) =>
    set((state) => ({
      suggestions: state.suggestions.map((s) => {
        const size = sizes.get(s.id);
        return size ? { ...s, size } : s;
      }),
    })),
  fail: (error) => set({ status: 'error', error, progress: null }),
  remove: (ids) =>
    set((state) => {
      const gone = new Set(ids);
      const suggestions = state.suggestions.filter((s) => !gone.has(s.id));
      const shown = suggestions.filter((s) => s.score >= state.minScore).length;
      return { suggestions, index: Math.max(0, Math.min(state.index, shown - 1)) };
    }),
  setIndex: (index) => set({ index }),
  setMinScore: (minScore) => set({ minScore, index: 0 }),
  close: () => set(idle),
}));

/** The suggestions shown at the chosen similarity. */
export function shownSuggestions(state: {
  suggestions: readonly Suggestion[];
  minScore: number;
}): Suggestion[] {
  return state.suggestions.filter((s) => s.score >= state.minScore);
}

/** Whether line sizes are still being read for any suggestion. */
export function readingSizes(suggestions: readonly Suggestion[]): boolean {
  return suggestions.some((s) => s.size.status === 'reading');
}
