// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKERS_LIMITS, checkWorkersLimits, workersLimitProblems } from './workers-limits.mjs';

const MiB = 1024 * 1024;

/** wrangler.jsonc as data: comments and trailing commas removed. */
async function wranglerConfig() {
  const text = await readFile(resolve(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8');
  return JSON.parse(
    text
      .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (_, string?: string) => string ?? '')
      .replace(/,(\s*[}\]])/g, '$1'),
  );
}

describe('Cloudflare Workers static-asset limits', () => {
  it('accepts a build within the limits', () => {
    const files = [
      { path: 'index.html', bytes: 2_000 },
      { path: 'assets/reader.wasm', bytes: 10 * MiB },
    ];
    expect(workersLimitProblems(files, '/*\n  X-Content-Type-Options: nosniff\n')).toEqual([]);
  });

  it('reports a file over 25 MiB', () => {
    const problems = workersLimitProblems([{ path: 'assets/big.wasm', bytes: 26 * MiB }], null);
    expect(problems).toEqual([expect.stringContaining('assets/big.wasm')]);
  });

  it('reports too many files, not counting the configuration files', () => {
    const files = Array.from({ length: WORKERS_LIMITS.files }, (_, i) => ({
      path: `f${i}.js`,
      bytes: 1,
    }));
    expect(workersLimitProblems([...files, { path: '_headers', bytes: 1 }], '')).toEqual([]);
    expect(workersLimitProblems([...files, { path: 'one-more.js', bytes: 1 }], null)).toEqual([
      expect.stringContaining('20000'),
    ]);
  });

  it('reports too many header rules and over-long header lines', () => {
    const rules = Array.from({ length: 101 }, (_, i) => `/p${i}\n  X-A: b`).join('\n');
    expect(workersLimitProblems([], rules)).toEqual([expect.stringContaining('101 rules')]);
    const long = `/*\n  Content-Security-Policy: ${'a'.repeat(2_000)}`;
    expect(workersLimitProblems([], long)).toEqual([expect.stringContaining('line 2')]);
  });

  it('checks a build folder and finds its largest file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workers-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<!doctype html>');
    await writeFile(join(dir, 'assets', 'a.js'), 'x'.repeat(5_000));
    await writeFile(join(dir, '_headers'), '/*\n  Referrer-Policy: no-referrer\n');
    const { files, largest, problems } = await checkWorkersLimits(dir);
    expect(files.map((f) => f.path)).toEqual(['_headers', 'assets/a.js', 'index.html']);
    expect(largest).toEqual({ path: 'assets/a.js', bytes: 5_000 });
    expect(problems).toEqual([]);
  });

  it('serves the Vite build as static assets only, so _headers covers every response', async () => {
    const config = await wranglerConfig();
    expect(config.name).toBe('qra-parts-count-tool');
    expect(config.assets.directory).toBe('./dist');
    // A Worker script would bypass _headers (and so the CSP) for its responses.
    expect(config.main).toBeUndefined();
    expect(config.assets.not_found_handling).toBe('none');
  });
});
