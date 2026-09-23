/** Build without a native DWG reader (VITE_DWG_READER=none). */
export const DWG_READER_NAME: string = '';

export function createDwgWorker(): Worker | null {
  return null;
}
