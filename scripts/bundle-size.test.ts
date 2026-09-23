// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INITIAL_JS_BUDGET_BYTES, initialScripts, measureInitialJs } from './bundle-size.mjs';

describe('bundle-size budget (FDS 9.1)', () => {
  it('is 1.5 MB', () => {
    expect(INITIAL_JS_BUDGET_BYTES).toBe(1_572_864);
  });

  it('counts the entry script and module preloads, not lazy chunks', () => {
    const html = `
      <script type="module" crossorigin src="./assets/index-abc.js"></script>
      <link rel="modulepreload" crossorigin href="./assets/vendor-def.js">
      <link rel="stylesheet" href="./assets/index.css">`;
    expect(initialScripts(html)).toEqual(['assets/index-abc.js', 'assets/vendor-def.js']);
  });

  it('measures gzipped sizes from a dist folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bundle-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<script type="module" src="./assets/a.js"></script>');
    await writeFile(join(dir, 'assets', 'a.js'), 'console.log(1);'.repeat(1000));
    await writeFile(join(dir, 'assets', 'lazy.js'), 'x'.repeat(100_000));
    const { entries, total } = await measureInitialJs(dir);
    expect(entries.map((e) => e.file)).toEqual(['assets/a.js']);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(15_000);
  });
});
