/**
 * The documentation viewer: whether it is open, and where. It is not tied to a
 * project, so it opens on the start screen too, and reopens where it was left.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { HelpArticleId, HelpTarget } from './help-topics';

interface HelpState {
  open: boolean;
  articleId: HelpArticleId;
  sectionId: string | null;
  /** Bumped on every navigation, so the viewer scrolls even to the place it shows. */
  navigation: number;
  query: string;
  /** Opens the viewer, at `target` when given, else where it was left. */
  openHelp: (target?: HelpTarget) => void;
  navigate: (target: HelpTarget) => void;
  setQuery: (query: string) => void;
  close: () => void;
}

export const useHelpStore = create<HelpState>()((set) => ({
  open: false,
  articleId: 'getting-started',
  sectionId: null,
  navigation: 0,
  query: '',
  openHelp: (target) =>
    set((state) => ({
      open: true,
      ...(target
        ? {
            articleId: target.articleId,
            sectionId: target.sectionId ?? null,
            navigation: state.navigation + 1,
            query: '',
          }
        : {}),
    })),
  navigate: (target) =>
    set((state) => ({
      articleId: target.articleId,
      sectionId: target.sectionId ?? null,
      navigation: state.navigation + 1,
    })),
  setQuery: (query) => set({ query }),
  close: () => set({ open: false }),
}));

export function openHelp(target?: HelpTarget): void {
  useHelpStore.getState().openHelp(target);
}

/** F1 opens the documentation, on the start screen and in a project alike. */
export function useHelpShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F1' || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      openHelp();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
