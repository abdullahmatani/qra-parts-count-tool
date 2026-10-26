// Generates e2e/fixtures/PEFS-4001_features.dwg: the PEFS-4001 test drawing plus
// entities the DWG reader once lost without a word (DRW-02):
//   - an arrow drawn as a polyline whose last segment tapers from 3 mm to 0,
//   - a thick line drawn as a polyline with a constant width of 1.5 mm,
//   - a circle with a (0, 0, -1) extrusion (OCS x mirrored), and
//   - a TRACE, which LibreDWG does not convert and the app reports as not shown.
//
// Needs LibreDWG's command-line tools (dxf2dwg, dwgread, dwgwrite; built from the
// 0.13.3 release source) on the PATH. Run: node scripts/generate-dwg-feature-fixture.mjs
// dxf2dwg 0.13.3 does not import per-vertex LWPOLYLINE widths, so they are added
// to a JSON dump of the converted drawing, which dwgwrite turns back into a DWG.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtures = new URL('../e2e/fixtures/', import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), 'dwg-fixture-'));

// ---- the DXF: PEFS-4001 with the extra model-space entities ------------------
const lines = readFileSync(join(fixtures, 'PEFS-4001.dxf'), 'utf8').split(/\r?\n/);
const at = lines.findIndex((l, i) => l.trim() === 'ENTITIES' && lines[i - 1]?.trim() === '2');
const extra = [];
let handle = 0xf000;
const pairs = (...items) => {
  for (let i = 0; i < items.length; i += 2)
    extra.push(String(items[i]).padStart(3), String(items[i + 1]));
};
const head = (type, layer = 'PIPE') =>
  pairs(0, type, 5, (handle++).toString(16).toUpperCase(), 330, '1F', 100, 'AcDbEntity', 8, layer);
// F000: arrow (its widths are added below).
head('LWPOLYLINE');
pairs(100, 'AcDbPolyline', 90, 3, 70, 0, 10, 100, 20, 300, 10, 140, 20, 300, 10, 146, 20, 300);
// F001: thick line.
head('LWPOLYLINE');
pairs(100, 'AcDbPolyline', 90, 2, 70, 0, 43, 1.5, 10, 160, 20, 280, 10, 160, 20, 320);
// F002: mirrored circle, drawn at x = +250.
head('CIRCLE');
pairs(100, 'AcDbCircle', 10, -250, 20, 300, 30, 0, 40, 4, 210, 0, 220, 0, 230, -1);
// F003: trace.
head('TRACE');
pairs(100, 'AcDbTrace', 10, 220, 20, 300, 30, 0, 11, 230, 21, 300, 31, 0);
pairs(12, 220, 22, 302, 32, 0, 13, 230, 23, 302, 33, 0);
lines.splice(at + 1, 0, ...extra);
writeFileSync(join(work, 'in.dxf'), lines.join('\r\n'));

// ---- DXF → DWG → JSON, add the arrow's widths, JSON → DWG --------------------
const run = (tool, ...args) => execFileSync(tool, args, { cwd: work, stdio: 'pipe' });
run('dxf2dwg', '-y', '--as', 'r2000', '-o', 'step.dwg', 'in.dxf');
run('dwgread', '-O', 'JSON', '-o', 'step.json', 'step.dwg');
const json = readFileSync(join(work, 'step.json'), 'utf8');
// The arrow's own JSON object: no braces between its handle and its bulges.
const arrow =
  /("handle": \[0,2,61440\],[^{}]*?)"flag": \d+,(?:\s*"const_width": [\d.]+,)?([^{}]*?"bulges": \[[^{}]*?\])/;
if (!arrow.test(json)) throw new Error('arrow polyline not found in the JSON dump');
const widths = [
  [0, 0],
  [3, 0],
  [0, 0],
].map(([start, end]) => `{ "start": ${start}.0, "end": ${end}.0 }`);
writeFileSync(
  join(work, 'out.json'),
  // Flag 32: the polyline has per-vertex widths.
  json.replace(arrow, `$1"flag": 32,$2,\n      "widths": [ ${widths.join(', ')} ]`),
);
run('dwgwrite', '-y', '--as', 'r2000', '-o', join(fixtures, 'PEFS-4001_features.dwg'), 'out.json');
rmSync(work, { recursive: true, force: true });
console.log('wrote e2e/fixtures/PEFS-4001_features.dwg');
