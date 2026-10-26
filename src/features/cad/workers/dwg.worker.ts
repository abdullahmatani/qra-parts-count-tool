/// <reference lib="webworker" />
/**
 * DWG reader worker (DRW-02), using LibreDWG compiled to WebAssembly.
 *
 * Licence boundary: LibreDWG and @mlightcad/libredwg-web are GPL-3.0. They are
 * only ever loaded inside this separately built worker, which returns plain
 * data in the app's neutral CAD model. See docs/spikes/dwg-renderer.md.
 *
 * A fresh WASM instance is created for every file: the spike showed that
 * reusing one instance across files can leave it in a state that traps.
 */
import { LibreDwg, Dwg_File_Type, createModule } from '@mlightcad/libredwg-web';
import wasmUrl from 'libredwg-wasm?url';
import { convertDwgDatabase, type SkippedEntity } from '../dwg/convert-libredwg';
import { findSkippedEntities } from '../dwg/skipped-entities';
import { serveCadWorker } from './worker-core';

async function readDwg(bytes: ArrayBuffer, fileType: 'dwg' | 'dxf') {
  const module = await createModule({ locateFile: () => wasmUrl });
  const lib = LibreDwg.createByWasmInstance(module);
  const data = lib.dwg_read_data(bytes, fileType === 'dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG);
  if (!data) throw new Error('LibreDWG could not read this file.');
  try {
    const db = lib.convert(data);
    const layerNames = new Map(db.tables.LAYER.entries.map((l) => [l.handle, l.name] as const));
    // Entities LibreDWG leaves out are reported to the user as missing, not lost
    // silently. The scan only adds that report: a file it fails on still opens.
    let skipped: SkippedEntity[] = [];
    try {
      skipped = findSkippedEntities(module, data, layerNames);
    } catch (error) {
      console.warn('Could not scan the DWG for entities LibreDWG skips', error);
    }
    return convertDwgDatabase(db, { fromDwg: fileType !== 'dxf', skipped });
  } finally {
    lib.dwg_free(data);
  }
}

serveCadWorker(self as unknown as Parameters<typeof serveCadWorker>[0], readDwg);
