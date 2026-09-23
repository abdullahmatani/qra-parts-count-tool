/**
 * Creates the DWG reader worker. The build can exclude LibreDWG (GPL-3.0)
 * entirely with VITE_DWG_READER=none, in which case vite.config.ts swaps this
 * module for dwg-reader.none.ts and native .dwg import reports that the reader
 * is not included (DXF and PDF plots still work, DRW-10).
 */
export const DWG_READER_NAME: string = 'LibreDWG';

export function createDwgWorker(): Worker | null {
  return new Worker(new URL('./dwg.worker.ts', import.meta.url), {
    type: 'module',
    name: 'dwg-reader',
  });
}
