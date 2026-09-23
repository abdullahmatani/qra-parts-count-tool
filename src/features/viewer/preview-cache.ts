/**
 * Render cache for drawing previews (FDS section 5: `cache/`, rebuildable;
 * risk R5). The first time a drawing is shown, its preview bitmap is saved as a
 * PNG keyed by the file hash, so reopening the drawing or switching back to its
 * tab shows it at once instead of parsing and rasterising the whole sheet again.
 */
import type { Drawing } from '@/domain/schema/types';
import { readFile, writeFile } from '@/lib/fs/files';
import { isNotFound, type FsDirHandle } from '@/lib/fs/types';

export const PREVIEW_CACHE_DIR = 'cache/previews';
/** Bump when the preview renderers change their output. */
export const PREVIEW_CACHE_VERSION = 1;

/** File-name-safe, collision-resistant key for a CAD space (layout) name. */
function spaceKey(space: string): string {
  const safe = space.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60);
  let hash = 0;
  for (const ch of space) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `${safe}-${(hash >>> 0).toString(36)}`;
}

/**
 * Cache file for a drawing's preview. `variant` covers anything else that
 * changes the image, such as the CAD colour mode.
 */
export function previewCachePath(
  drawing: Pick<Drawing, 'fileHash' | 'fileType' | 'page' | 'layout'>,
  maxDimension: number,
  variant = '',
): string {
  const part =
    drawing.fileType === 'pdf'
      ? `p${drawing.page ?? 1}`
      : `l-${spaceKey(drawing.layout ?? '')}${variant ? `-${variant}` : ''}`;
  return `${PREVIEW_CACHE_DIR}/${drawing.fileHash}-${part}-${maxDimension}-v${PREVIEW_CACHE_VERSION}.png`;
}

/** Reads a cached preview; `null` when there is none or it cannot be decoded. */
export async function readCachedPreview(
  dir: FsDirHandle,
  path: string,
): Promise<HTMLCanvasElement | null> {
  let file: File;
  try {
    file = await readFile(dir, path);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  } catch {
    // A damaged cache entry is rebuilt.
    return null;
  }
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Saves a preview; failures are ignored because the cache is rebuildable. */
export async function writeCachedPreview(
  dir: FsDirHandle,
  path: string,
  canvas: HTMLCanvasElement,
): Promise<void> {
  try {
    const blob = await toPng(canvas);
    if (blob) await writeFile(dir, path, blob);
  } catch {
    // Read-only folder, full disk: the drawing still opens, just not from cache.
  }
}
