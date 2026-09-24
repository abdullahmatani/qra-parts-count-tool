// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectLicenses, thirdPartyNotice } from './licenses.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('third-party licences (GPL-3.0 notices)', () => {
  it('lists every production dependency with its licence text', async () => {
    const packages = await collectLicenses(ROOT);
    const by = new Map(packages.map((p) => [p.name, p]));
    expect(by.get('@mlightcad/libredwg-web')?.license).toBe('GPL-3.0');
    expect(by.get('pdfjs-dist')?.license).toBe('Apache-2.0');
    expect(by.get('react')?.license).toBe('MIT');
    expect(by.get('react')?.texts[0]?.text).toContain('Permission is hereby granted');
    // Dependencies of dependencies are included; Node-only optional builds are not.
    expect(by.has('scheduler')).toBe(true);
    expect([...by.keys()].some((name) => name.startsWith('@napi-rs/'))).toBe(false);
    // Development tools are not part of the app.
    expect(by.has('vite')).toBe(false);

    const notice = thirdPartyNotice(packages);
    expect(notice).toContain('GNU General Public License, version 3');
    expect(notice).toContain('GNU LibreDWG');
    expect(notice).toContain('pdfjs-dist');
  });
});
