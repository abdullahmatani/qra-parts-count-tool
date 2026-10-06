/**
 * The guided tour's progress. Kept in memory for the tab: the tour runs on a
 * practice project that is not saved either.
 */
import { create } from 'zustand';
import { useProjectStore } from '@/store/project-store';
import { TOUR_STEPS } from './tour-steps';

interface TourState {
  /** The coach card is showing. */
  active: boolean;
  /** The practice project's id, while it is open (the tour may have ended). */
  projectId: string | null;
  step: number;
  /** Drawings shown since the step began. */
  visited: string[];
  collapsed: boolean;
  /** Where the card was dragged to (its top-left corner), or null for its corner. */
  position: { x: number; y: number } | null;
  start: (projectId: string) => void;
  goTo: (step: number) => void;
  next: () => void;
  back: () => void;
  /** Moves on from `step` if the tour is still there (for a step done while it showed). */
  advanceFrom: (step: number) => void;
  visit: (drawingId: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  setPosition: (position: { x: number; y: number } | null) => void;
  /** Hides the card; the practice project stays open. */
  end: () => void;
  /** Shows the card again at the step it was on. */
  resume: () => void;
  /** Forgets the practice project once it is closed. */
  reset: () => void;
}

const last = TOUR_STEPS.length - 1;
const clamp = (step: number) => Math.max(0, Math.min(last, step));

export const useTourStore = create<TourState>()((set, get) => ({
  active: false,
  projectId: null,
  step: 0,
  visited: [],
  collapsed: false,
  position: null,
  start: (projectId) =>
    set({ active: true, projectId, step: 0, visited: [], collapsed: false, position: null }),
  goTo: (step) => set({ step: clamp(step), visited: [], collapsed: false }),
  next: () => get().goTo(get().step + 1),
  back: () => get().goTo(get().step - 1),
  advanceFrom: (step) => {
    if (get().active && get().step === step && step < last) get().goTo(step + 1);
  },
  visit: (drawingId) =>
    set((state) =>
      state.visited.includes(drawingId) ? {} : { visited: [...state.visited, drawingId] },
    ),
  setCollapsed: (collapsed) => set({ collapsed }),
  setPosition: (position) => set({ position }),
  end: () => set({ active: false }),
  resume: () => set((state) => (state.projectId ? { active: true, collapsed: false } : {})),
  reset: () => set({ active: false, projectId: null, step: 0, visited: [] }),
}));

// The tour belongs to its practice project: closing that, or opening another, ends it.
useProjectStore.subscribe((state) => {
  const { projectId, reset } = useTourStore.getState();
  if (projectId !== null && state.doc?.id !== projectId) reset();
});
