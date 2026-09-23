import type { Drawing } from '@/domain/schema/types';
import { readFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';
import type { DrawingSource } from './drawing-source';
import { PdfDocumentCache } from './pdf/pdf-source';

export const pdfCache = new PdfDocumentCache(4);

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
  throw new UnsupportedDrawingError(drawing.fileType);
}
