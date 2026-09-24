/**
 * NFR-08: every language carries every string of the English catalogue, with
 * the plural forms i18next asks for and the same {{placeholders}}.
 */
import { describe, expect, it } from 'vitest';
import i18n, { directionFor, resources, tFile } from '.';
import en from './locales/en.json';

type Catalogue = { [key: string]: string | Catalogue };

function flatten(node: Catalogue, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const english = flatten(en);

describe.each(Object.keys(resources).filter((code) => code !== 'en'))('%s catalogue', (code) => {
  const catalogue = flatten(resources[code as keyof typeof resources].translation as Catalogue);
  const forms = new Intl.PluralRules(code).resolvedOptions().pluralCategories;

  /**
   * The keys this language needs: English keys, with plurals in its own forms,
   * each against the English form of the same name or else English "other".
   */
  const expected = new Map<string, string>();
  for (const [key, text] of english) {
    const base = key.replace(PLURAL_SUFFIX, '');
    if (base === key) expected.set(key, text);
    else if (key.endsWith('_other')) {
      for (const form of forms)
        expected.set(`${base}_${form}`, english.get(`${base}_${form}`) ?? text);
    }
  }

  it('has every key, and no others', () => {
    expect([...catalogue.keys()].filter((k) => !expected.has(k))).toEqual([]);
    expect([...expected.keys()].filter((k) => !catalogue.has(k))).toEqual([]);
  });

  it('keeps the placeholders of each English string', () => {
    const wrong = [...expected]
      .filter(([key, text]) => {
        const translated = catalogue.get(key);
        return (
          translated !== undefined && placeholders(translated).join() !== placeholders(text).join()
        );
      })
      .map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it('translates every string', () => {
    expect([...catalogue].filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([]);
  });
});

describe('language switching', () => {
  it('lays Arabic out right to left and English left to right', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('ar-QA')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });

  it('picks the Arabic plural form for each count', async () => {
    await i18n.changeLanguage('ar');
    try {
      expect(i18n.t('search.hits', { count: 1 })).toContain('تطابق واحد');
      expect(i18n.t('search.hits', { count: 5 })).toBe('5 تطابقات');
      expect(i18n.t('search.hits', { count: 0 })).toBe('0 تطابقات');
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('writes exported files in English whatever the interface language', async () => {
    await i18n.changeLanguage('ar');
    try {
      expect(i18n.t('export.sheets.items')).not.toBe('Item List');
      expect(tFile('export.sheets.items')).toBe('Item List');
      expect(tFile('export.check.kinds.unassignedMarkers', { count: 2 })).toBe(
        '2 markers are not in a segment',
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
