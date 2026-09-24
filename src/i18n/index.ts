/**
 * Internationalisation (NFR-08): English and Arabic. Every user-facing string
 * lives in locales/<language>.json; Arabic lays the interface out right to
 * left. Exported files (Excel sheets and columns, PDF legends and stamps)
 * always use English, the language of client templates and deliverables.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

export const defaultNS = 'translation';
export const resources = { en: { translation: en }, ar: { translation: ar } } as const;
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
] as const;

/** The saved interface language, read before the first render so it does not flash English. */
function savedLanguage(): string {
  try {
    const saved = JSON.parse(localStorage.getItem('qrapc.preferences') ?? 'null') as {
      state?: { language?: string };
    } | null;
    const language = saved?.state?.language;
    return language && language in resources ? language : 'en';
  } catch {
    return 'en';
  }
}

const initialLanguage = savedLanguage();

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  defaultNS,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Text direction for a language; drives <html dir> for RTL support. */
export function directionFor(language: string): 'ltr' | 'rtl' {
  return ['ar', 'he', 'fa', 'ur'].includes(language.split('-')[0] ?? '') ? 'rtl' : 'ltr';
}

/** Switches the interface language and sets <html lang> and <html dir>. */
export function applyLanguage(language: string): void {
  if (i18n.language !== language) void i18n.changeLanguage(language);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = directionFor(language);
  }
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage;
  document.documentElement.dir = directionFor(initialLanguage);
}

/** English, for text written into exported files whatever the interface language. */
export const tFile = i18n.getFixedT('en');

export default i18n;
