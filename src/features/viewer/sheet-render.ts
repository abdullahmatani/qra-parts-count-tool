/**
 * The whole sheet of a drawing as pixels, for tools that read its line work
 * (find similar symbols, the auto trace). The drawing gets a source of its
 * own, apart from the viewer's, and CAD drawings are read in monochrome, as
 * plotted, with the layers the user hid left out.
 */
import type { Drawing } from '@/domain/schema/types';
import { readFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';
import { useUiStore } from '@/store/ui-store';
import type { DrawingSource } from './drawing-source';
import type { PdfPageSource } from './pdf/pdf-source';
import { BASE_SCALE } from './view-transform';

export async function openSheetSource(dir: FsDirHandle, drawing: Drawing): Promise<DrawingSource> {
  if (drawing.fileType === 'pdf') {
    const { pdfCache } = await import('./load-source');
    return pdfCache.openPage(
      `${drawing.fileName}#${drawing.fileHash}`,
      async () => (await readFile(dir, `drawings/${drawing.fileName}`)).arrayBuffer(),
      drawing.page ?? 1,
    );
  }
  const [{ loadCadDisplayList }, { CadDrawingSource }] = await Promise.all([
    import('@/features/cad/cad-drawings'),
    import('@/features/cad/cad-source'),
  ]);
  const hidden = useUiStore.getState().hiddenLayers[drawing.id] ?? [];
  return new CadDrawingSource(await loadCadDisplayList(dir, drawing), 'monochrome', hidden);
}

/** Lets go of a source from `openSheetSource`. */
export function closeSheetSource(drawing: Drawing, source: DrawingSource | null): void {
  // The viewer may be showing this page: leave its parsed state alone.
  if (drawing.fileType === 'pdf') (source as PdfPageSource | null)?.dispose(false);
  else source?.dispose();
}

/** The whole sheet as canvas pixels at `scale` pixels per drawing unit. */
export async function renderSheet(
  source: DrawingSource,
  scale: number,
  errorMessage: string,
): Promise<ImageData> {
  const width = Math.max(1, Math.round(source.size.width * scale));
  const height = Math.max(1, Math.round(source.size.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const view = {
    x: source.size.width / 2,
    y: source.size.height / 2,
    zoom: scale / BASE_SCALE,
    rotation: 0 as const,
  };
  await source.render({ canvas, view, canvasSize: { width, height }, devicePixelRatio: 1 }).promise;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(errorMessage);
  return ctx.getImageData(0, 0, width, height);
}
