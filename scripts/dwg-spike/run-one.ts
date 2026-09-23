/**
 * Runs one candidate reader on one file and prints a JSON result line. Run in a
 * child process by run-spike.ts, so a crash in a WASM reader is isolated.
 *   tsx scripts/dwg-spike/run-one.ts <candidate> <file>
 */
import { readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildDisplayList, listSpaces } from '../../src/features/cad/display-list';
import type { CadDocument } from '../../src/features/cad/model';

const [candidate, file] = process.argv.slice(2) as [string, string];

async function read(): Promise<CadDocument> {
  const bytes = readFileSync(file);
  if (candidate === 'libredwg') {
    const { Dwg_File_Type, LibreDwg } = await import('@mlightcad/libredwg-web');
    const { convertDwgDatabase } = await import('../../src/features/cad/dwg/convert-libredwg');
    const lib = await LibreDwg.create(
      new URL('../../node_modules/@mlightcad/libredwg-web/wasm/', import.meta.url).pathname,
    );
    const isDxf = file.toLowerCase().endsWith('.dxf');
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const dwg = lib.dwg_read_data(buffer, isDxf ? Dwg_File_Type.DXF : Dwg_File_Type.DWG);
    if (!dwg) throw new Error('reader returned no data');
    const db = lib.convert(dwg);
    lib.dwg_free(dwg);
    return convertDwgDatabase(db, { fromDwg: !isDxf });
  }
  if (candidate === 'app-dxf') {
    const { parseDxf } = await import('../../src/features/cad/dxf/parse-dxf');
    return parseDxf(new TextDecoder('utf-8').decode(bytes));
  }
  throw new Error(`unknown candidate ${candidate}`);
}

const size = statSync(file).size;
const started = performance.now();
try {
  const doc = await read();
  const parsed = performance.now();
  const spaces = listSpaces(doc).map((space) => {
    const t = performance.now();
    const list = buildDisplayList(doc, space.name);
    return {
      name: space.name,
      entities: space.entities,
      paths: list.stats.paths,
      texts: list.stats.texts,
      fills: list.stats.fills,
      blocks: list.stats.blocks,
      buildMs: Math.round(performance.now() - t),
    };
  });
  const entityTypes: Record<string, number> = {};
  const count = (list: CadDocument['modelSpace']) => {
    for (const e of list) entityTypes[e.type] = (entityTypes[e.type] ?? 0) + 1;
  };
  count(doc.modelSpace);
  for (const b of Object.values(doc.blocks)) count(b.entities);
  for (const l of doc.layouts) count(l.entities);
  console.log(
    JSON.stringify({
      ok: true,
      candidate,
      file,
      size,
      readMs: Math.round(parsed - started),
      spaces,
      entityTypes,
      unsupported: doc.unsupported,
      heapMb: Math.round(process.memoryUsage().heapUsed / 1e6),
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      candidate,
      file,
      size,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}
