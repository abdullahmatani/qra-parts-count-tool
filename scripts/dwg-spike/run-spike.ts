/**
 * DWG renderer spike harness (roadmap #12, risk R1).
 *
 * Runs every candidate reader on every DWG/DXF file in a folder, each in its own
 * process, and writes a Markdown results table. Use it on the client's sample
 * PEFS/P&IDs when they are available:
 *
 *   pnpm spike:dwg <folder-with-samples> [output.md]
 *
 * Candidates:
 *   libredwg  LibreDWG compiled to WASM (@mlightcad/libredwg-web, GPL-3.0), DWG and DXF
 *   app-dxf   the app's own DXF parser (src/features/cad/dxf), DXF only
 * The ODA Drawings SDK is commercial and not available to this project; see the report.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const folder = resolve(process.argv[2] ?? '.cache/dwg-samples');
const output = process.argv[3];
const files = readdirSync(folder)
  .filter((name) => /\.(dwg|dxf)$/i.test(name))
  .sort()
  .map((name) => join(folder, name));

interface Result {
  ok: boolean;
  candidate: string;
  file: string;
  size: number;
  readMs?: number;
  spaces?: { name: string; paths: number; texts: number; fills: number; buildMs: number }[];
  entityTypes?: Record<string, number>;
  unsupported?: Record<string, number>;
  error?: string;
}

const results: Result[] = [];
for (const file of files) {
  const candidates = file.toLowerCase().endsWith('.dxf') ? ['libredwg', 'app-dxf'] : ['libredwg'];
  for (const candidate of candidates) {
    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve(import.meta.dirname, 'run-one.ts'), candidate, file],
      { encoding: 'utf8', timeout: 120_000 },
    );
    const line = run.stdout
      .split('\n')
      .reverse()
      .find((l) => l.startsWith('{'));
    const result: Result = line
      ? JSON.parse(line)
      : {
          ok: false,
          candidate,
          file,
          size: 0,
          error:
            run.signal === 'SIGTERM'
              ? 'timeout (120 s)'
              : `crashed: ${(run.stderr.match(/RuntimeError[^\n]*/) ?? [run.stderr.trim().split('\n').pop()])[0]}`,
        };
    results.push(result);
    process.stderr.write(
      `${result.ok ? 'ok  ' : 'FAIL'} ${candidate.padEnd(9)} ${basename(file)}\n`,
    );
  }
}

const rows = results.map((r) => {
  const spaces = r.spaces ?? [];
  const drawn = spaces.reduce((sum, s) => sum + s.paths + s.texts + s.fills, 0);
  const build = spaces.reduce((sum, s) => sum + s.buildMs, 0);
  const unsupported = Object.entries(r.unsupported ?? {})
    .map(([k, v]) => `${k} ×${v}`)
    .join(', ');
  return `| ${basename(r.file)} | ${(r.size / 1024).toFixed(0)} kB | ${r.candidate} | ${r.ok ? 'yes' : `**no** — ${r.error}`} | ${r.readMs ?? '—'} | ${build || '—'} | ${spaces.length || '—'} | ${drawn || '—'} | ${unsupported || '—'} |`;
});
const table = [
  '| File | Size | Reader | Opened | Read ms | Build ms | Spaces | Primitives | Unsupported entities |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows,
].join('\n');
const ok = (candidate: string) => {
  const mine = results.filter((r) => r.candidate === candidate);
  return `${mine.filter((r) => r.ok).length}/${mine.length}`;
};
const summary = `Opened: libredwg ${ok('libredwg')}, app-dxf ${ok('app-dxf')}.`;
const report = `${summary}\n\n${table}\n`;
if (output) writeFileSync(output, report);
console.log(report);
