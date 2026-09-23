/** Find bar state (DRW-08): the query, the current hit and project-wide results. */
import { create } from 'zustand';

export interface ProjectSearch {
  query: string;
  results: { drawingId: string; count: number }[];
  done: number;
  total: number;
}

interface SearchState {
  open: boolean;
  query: string;
  /** Current hit on the active drawing. */
  index: number;
  /** Move to the first hit once the active drawing's hits are known. */
  jumpToFirst: boolean;
  project: ProjectSearch | null;
  /** Bumped to move the keyboard focus back to the search field. */
  focusToken: number;
  openFind: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setIndex: (index: number) => void;
  setJumpToFirst: (jump: boolean) => void;
  setProject: (project: ProjectSearch | null) => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  open: false,
  query: '',
  index: 0,
  jumpToFirst: false,
  project: null,
  focusToken: 0,
  openFind: () => set((s) => ({ open: true, focusToken: s.focusToken + 1 })),
  close: () => set({ open: false, project: null, jumpToFirst: false }),
  setQuery: (query) => set({ query, index: 0, project: null }),
  setIndex: (index) => set({ index }),
  setJumpToFirst: (jumpToFirst) => set({ jumpToFirst }),
  setProject: (project) => set({ project }),
}));
