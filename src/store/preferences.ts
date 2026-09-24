import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { applyLanguage } from '@/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'comfortable';
/** How DWG/DXF drawings are coloured: like a monochrome plot, or with their CAD colours. */
export type CadColorMode = 'monochrome' | 'color';
/** Interface language (NFR-08); Arabic lays the interface out right to left. */
export type Language = 'en' | 'ar';

/**
 * Per-user interface preferences. These are stored in the browser (localStorage)
 * because they belong to the person, not the project; no project data is ever
 * kept only in browser storage (risk R6).
 */
export interface PreferencesState {
  theme: ThemePreference;
  density: Density;
  /** Author initials stamped on notes (NTE-02). */
  initials: string;
  cadColorMode: CadColorMode;
  language: Language;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemePreference) => void;
  setCadColorMode: (mode: CadColorMode) => void;
  setDensity: (density: Density) => void;
  setInitials: (initials: string) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      density: 'compact',
      initials: '',
      cadColorMode: 'monochrome',
      language: 'en',
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setCadColorMode: (cadColorMode) => set({ cadColorMode }),
      setDensity: (density) => set({ density }),
      setInitials: (initials) => set({ initials: initials.trim().slice(0, 8) }),
    }),
    {
      name: 'qrapc.preferences',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, density, initials, cadColorMode, language }) => ({
        theme,
        density,
        initials,
        cadColorMode,
        language,
      }),
    },
  ),
);

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

/** Resolves the theme preference to the theme actually shown. */
export function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme === 'system') return prefersDark() ? 'dark' : 'light';
  return theme;
}

/** Applies theme and density classes to <html> and follows OS theme changes. */
export function useApplyPreferences(): 'light' | 'dark' {
  const theme = usePreferences((s) => s.theme);
  const density = usePreferences((s) => s.density);
  const resolved = resolveTheme(theme);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const next = resolveTheme(theme);
      root.classList.toggle('dark', next === 'dark');
      root.style.colorScheme = next;
    };
    apply();
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('density-comfortable', density === 'comfortable');
  }, [density]);

  const language = usePreferences((s) => s.language);
  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  return resolved;
}
