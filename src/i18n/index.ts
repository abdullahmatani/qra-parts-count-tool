/**
 * Internationalisation (NFR-08). English only in v1; every user-facing string
 * lives in locales/en.json so an Arabic (RTL) catalogue can be added later.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

export const defaultNS = 'translation';
export const resources = { en: { translation: en } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
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

export default i18n;
