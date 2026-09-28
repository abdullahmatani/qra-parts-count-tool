/**
 * Internationalisation (NFR-08): the interface is in English. Every
 * user-facing string lives in locales/en.json rather than in the components.
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

/** The translator for text written into exported files (Excel sheets, PDF legends and stamps). */
export const tFile = i18n.getFixedT('en');

export default i18n;
