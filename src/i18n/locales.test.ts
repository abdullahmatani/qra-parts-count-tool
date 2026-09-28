/**
 * NFR-08: the interface is in English, with every string in one catalogue.
 */
import { describe, expect, it } from 'vitest';
import i18n, { resources, tFile } from '.';
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

describe('English catalogue', () => {
  it('is the only language', () => {
    expect(Object.keys(resources)).toEqual(['en']);
    expect(i18n.language).toBe('en');
  });

  it('has text for every string', () => {
    expect([...flatten(en)].filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([]);
  });

  it('writes exported files in English', () => {
    expect(tFile('export.sheets.items')).toBe('Item List');
    expect(tFile('export.check.kinds.unassignedMarkers', { count: 2 })).toBe(
      '2 markers are not in a segment',
    );
  });
});
