import { create } from 'zustand';
import type { CadCandidate } from './import-drawings';

interface SpacePickerState {
  request: {
    candidates: CadCandidate[];
    resolve: (choice: string[][] | null) => void;
  } | null;
  /** Asks the user which spaces of each DWG/DXF file to import (DRW-02). */
  ask: (candidates: CadCandidate[]) => Promise<string[][] | null>;
  answer: (choice: string[][] | null) => void;
}

export const useSpacePicker = create<SpacePickerState>()((set, get) => ({
  request: null,
  ask: (candidates) =>
    new Promise((resolve) => {
      get().request?.resolve(null);
      set({ request: { candidates, resolve } });
    }),
  answer: (choice) => {
    get().request?.resolve(choice);
    set({ request: null });
  },
}));
