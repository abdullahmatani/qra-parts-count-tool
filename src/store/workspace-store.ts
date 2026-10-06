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
  /**
   * PRJ-08: the project was opened from a .zip into memory (browsers without
   * folder access). Nothing is saved; exports are offered as a download.
   */
  inMemory: boolean;
  /** The folder of the last export written in this session, e.g. `exports/2026-09-23_104512`. */
  lastExportFolder: string | null;

  setDirectory: (name: string | null) => void;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  markSaved: (at: Date) => void;
  setOpenWarnings: (warnings: string[]) => void;
  setInMemory: (inMemory: boolean) => void;
  setLastExportFolder: (folder: string | null) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  directoryName: null,
  saveStatus: 'idle',
  lastSavedAt: null,
  saveError: null,
  openWarnings: [],
  inMemory: false,
  lastExportFolder: null,

  setDirectory: (directoryName) => set({ directoryName }),
  setSaveStatus: (saveStatus, saveError = null) => set({ saveStatus, saveError }),
  markSaved: (at) => set({ saveStatus: 'saved', lastSavedAt: at, saveError: null }),
  setOpenWarnings: (openWarnings) => set({ openWarnings }),
  setInMemory: (inMemory) => set({ inMemory }),
  setLastExportFolder: (lastExportFolder) => set({ lastExportFolder }),
  reset: () =>
    set({
      directoryName: null,
      saveStatus: 'idle',
      lastSavedAt: null,
      saveError: null,
      openWarnings: [],
      inMemory: false,
      lastExportFolder: null,
    }),
}));
