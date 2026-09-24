/**
 * Symbol suggestions under review (roadmap #60). Kept in memory only: a
 * suggestion becomes part of the count when, and only when, the user accepts
 * it, which turns it into an ordinary marker.
 */
import { create } from 'zustand';

export interface Suggestion {
  id: string;
  /** A circle ringing the candidate symbol, in drawing coordinates. */
  cx: number;
  cy: number;
  r: number;
  /** How closely it matches the example, 0–1. */
  score: number;
}

export type AssistStatus = 'idle' | 'searching' | 'done' | 'error';

/** Similarity thresholds offered, strictest first. */
export const SIMILARITY_LEVELS = [0.9, 0.8, 0.75, 0.7, 0.6] as const;
/**
 * On the sample and CAD fixture sheets, 75 % finds every symbol and suggests one
 * false one (docs/spikes/symbol-detection.md).
 */
export const DEFAULT_SIMILARITY = 0.75;

interface AssistState {
  status: AssistStatus;
  drawingId: string | null;
  /** The counted marker the suggestions look like. */
  exampleId: string | null;
  /** Every candidate still to review, best first; the list shows those at `minScore` or above. */
  suggestions: Suggestion[];
  minScore: number;
  /** The suggestion in focus, within the shown list. */
  index: number;
  error: string | null;
  start: (drawingId: string, exampleId: string) => void;
  finish: (suggestions: Suggestion[]) => void;
  fail: (error: string) => void;
  remove: (ids: readonly string[]) => void;
  setIndex: (index: number) => void;
  setMinScore: (minScore: number) => void;
  close: () => void;
}

const idle = {
  status: 'idle' as AssistStatus,
  drawingId: null,
  exampleId: null,
  suggestions: [],
  index: 0,
  error: null,
};

export const useAssistStore = create<AssistState>()((set) => ({
  ...idle,
  minScore: DEFAULT_SIMILARITY,
  start: (drawingId, exampleId) => set({ ...idle, status: 'searching', drawingId, exampleId }),
  finish: (suggestions) => set({ status: 'done', suggestions, index: 0 }),
  fail: (error) => set({ status: 'error', error }),
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
