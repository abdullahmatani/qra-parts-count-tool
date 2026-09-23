import type { Drawing } from '@/domain/schema/types';
import { readFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';
import { CadDrawingSource } from '@/features/cad/cad-source';
import { usePreferences } from '@/store/preferences';
import type { DrawingSource } from './drawing-source';
import { PdfDocumentCache } from './pdf/pdf-source';

export const pdfCache = new PdfDocumentCache(4);

/** Loaded lazily so the CAD pipeline is only fetched when a DWG/DXF drawing is opened. */
async function loadCad(dir: FsDirHandle, drawing: Drawing): Promise<DrawingSource> {
  const { loadCadDisplayList } = await import('@/features/cad/cad-drawings');
  const list = await loadCadDisplayList(dir, drawing);
  return new CadDrawingSource(list, usePreferences.getState().cadColorMode);
}

export class UnsupportedDrawingError extends Error {
  constructor(fileType: string) {
    super(`Viewing ${fileType.toUpperCase()} drawings is not available yet.`);
    this.name = 'UnsupportedDrawingError';
  }
}

async function readDrawingBytes(dir: FsDirHandle, drawing: Drawing): Promise<ArrayBuffer> {
  const file = await readFile(dir, `drawings/${drawing.fileName}`);
  return file.arrayBuffer();
}

/** Opens the renderable source for a drawing from the working directory. */
export async function loadDrawingSource(
  dir: FsDirHandle,
  drawing: Drawing,
): Promise<DrawingSource> {
  if (drawing.fileType === 'pdf') {
    return pdfCache.openPage(
      `${drawing.fileName}#${drawing.fileHash}`,
      () => readDrawingBytes(dir, drawing),
      drawing.page ?? 1,
    );
  }
  if (drawing.fileType === 'dwg' || drawing.fileType === 'dxf') return loadCad(dir, drawing);
  throw new UnsupportedDrawingError(drawing.fileType);
}
