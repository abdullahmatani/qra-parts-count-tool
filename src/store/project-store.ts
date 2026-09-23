/**
 * Project document store with command-pattern undo/redo (PRJ-09).
 *
 * Every edit goes through `apply(label, recipe)`. The recipe mutates an Immer
 * draft; Immer records forward and inverse patches, which form the command
 * pushed onto the undo stack. Undo applies the inverse patches, redo the forward
 * ones. Edits with the same `coalesceKey` made within a short window (such as
 * typing in a text field) merge into one undo step.
 */
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { create } from 'zustand';
import type { ProjectDoc } from '@/domain/model';

enablePatches();

/** Undo steps kept per session; the FDS asks for at least 100 (PRJ-09). */
export const HISTORY_LIMIT = 200;
/** Edits with the same coalesce key closer together than this merge into one step. */
export const COALESCE_WINDOW_MS = 1200;

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  coalesceKey: string | undefined;
  at: number;
}

export interface ApplyOptions {
  /** Merge with the previous step when it has the same key and is recent. */
  coalesceKey?: string;
  /** Apply without recording an undo step (e.g. housekeeping after load). */
  skipHistory?: boolean;
}

export interface ProjectState {
  doc: ProjectDoc | null;
  /** Increments on every change to `doc`, including undo and redo; drives autosave. */
  changeCounter: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** PRJ-07: when true, edits are refused. */
  readOnly: boolean;

  load: (doc: ProjectDoc, options?: { readOnly?: boolean }) => void;
  close: () => void;
  apply: (
    label: string,
    recipe: (draft: Draft<ProjectDoc>) => void,
    options?: ApplyOptions,
  ) => boolean;
  undo: () => string | null;
  redo: () => string | null;
  /** Records save metadata without creating an undo step or triggering autosave. */
  markSaved: (meta: Pick<ProjectDoc, 'revision' | 'updatedAt'>) => void;
  setReadOnly: (readOnly: boolean) => void;
}

/** Injected clock, replaceable in tests. */
export const historyClock = { now: () => Date.now() };

export const useProjectStore = create<ProjectState>()((set, get) => ({
  doc: null,
  changeCounter: 0,
  past: [],
  future: [],
  readOnly: false,

  load: (doc, options) =>
    set({
      doc,
      past: [],
      future: [],
      changeCounter: 0,
      readOnly: options?.readOnly ?? false,
    }),

  close: () => set({ doc: null, past: [], future: [], changeCounter: 0, readOnly: false }),

  apply: (label, recipe, options = {}) => {
    const { doc, readOnly, past, changeCounter } = get();
    if (!doc || readOnly) return false;
    const [next, patches, inverse] = produceWithPatches(doc, recipe);
    if (patches.length === 0) return false;

    if (options.skipHistory) {
      set({ doc: next, changeCounter: changeCounter + 1 });
      return true;
    }

    const now = historyClock.now();
    const previous = past[past.length - 1];
    let nextPast: HistoryEntry[];
    if (
      options.coalesceKey &&
      previous?.coalesceKey === options.coalesceKey &&
      now - previous.at < COALESCE_WINDOW_MS
    ) {
      // Merge: forward patches run old then new; inverse patches run new then old.
      const merged: HistoryEntry = {
        label: previous.label,
        patches: [...previous.patches, ...patches],
        inverse: [...inverse, ...previous.inverse],
        coalesceKey: previous.coalesceKey,
        at: now,
      };
      nextPast = [...past.slice(0, -1), merged];
    } else {
      const entry: HistoryEntry = {
        label,
        patches,
        inverse,
        coalesceKey: options.coalesceKey,
        at: now,
      };
      nextPast = [...past, entry];
      if (nextPast.length > HISTORY_LIMIT)
        nextPast = nextPast.slice(nextPast.length - HISTORY_LIMIT);
    }
    set({ doc: next, past: nextPast, future: [], changeCounter: changeCounter + 1 });
    return true;
  },

  undo: () => {
    const { doc, past, future, readOnly, changeCounter } = get();
    const entry = past[past.length - 1];
    if (!doc || !entry || readOnly) return null;
    set({
      doc: applyPatches(doc, entry.inverse),
      past: past.slice(0, -1),
      future: [...future, { ...entry, coalesceKey: undefined }],
      changeCounter: changeCounter + 1,
    });
    return entry.label;
  },

  redo: () => {
    const { doc, past, future, readOnly, changeCounter } = get();
    const entry = future[future.length - 1];
    if (!doc || !entry || readOnly) return null;
    set({
      doc: applyPatches(doc, entry.patches),
      past: [...past, { ...entry, coalesceKey: undefined }],
      future: future.slice(0, -1),
      changeCounter: changeCounter + 1,
    });
    return entry.label;
  },

  markSaved: (meta) => {
    const { doc } = get();
    if (!doc) return;
    set({ doc: { ...doc, revision: meta.revision, updatedAt: meta.updatedAt } });
  },

  setReadOnly: (readOnly) => set({ readOnly }),
}));

/** Non-null document accessor for components rendered only when a project is open. */
export function useDoc<T>(selector: (doc: ProjectDoc) => T): T {
  return useProjectStore((state) => {
    if (!state.doc) throw new Error('No project is open');
    return selector(state.doc);
  });
}
