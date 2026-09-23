/**
 * State of the working directory connection and autosave (PRJ-01..05).
 * The directory handle itself lives in the file-system service; this store
 * holds what the interface needs to show.
 */
import { create } from 'zustand';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface WorkspaceState {
  /** Folder name of the open working directory. */
  directoryName: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  saveError: string | null;
  /** Integrity warnings found when the project was opened. */
  openWarnings: string[];

  setDirectory: (name: string | null) => void;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  markSaved: (at: Date) => void;
  setOpenWarnings: (warnings: string[]) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  directoryName: null,
  saveStatus: 'idle',
  lastSavedAt: null,
  saveError: null,
  openWarnings: [],

  setDirectory: (directoryName) => set({ directoryName }),
  setSaveStatus: (saveStatus, saveError = null) => set({ saveStatus, saveError }),
  markSaved: (at) => set({ saveStatus: 'saved', lastSavedAt: at, saveError: null }),
  setOpenWarnings: (openWarnings) => set({ openWarnings }),
  reset: () =>
    set({
      directoryName: null,
      saveStatus: 'idle',
      lastSavedAt: null,
      saveError: null,
      openWarnings: [],
    }),
}));
