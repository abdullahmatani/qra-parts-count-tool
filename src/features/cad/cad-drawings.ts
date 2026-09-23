/**
 * Display lists for CAD drawings in a project: served from the render cache
 * when present, otherwise rebuilt from the file in drawings/ (DRW-02).
 */
import type { Drawing } from '@/domain/schema/types';
import { readFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';
import { readCachedDisplayList, writeCachedDisplayList } from './cad-cache';
import { buildSpace, closeCadFile, openCadFile } from './cad-client';
import type { DisplayList } from './display-list';
import { MODEL_SPACE } from './model';

export async function loadCadDisplayList(dir: FsDirHandle, drawing: Drawing): Promise<DisplayList> {
  if (drawing.fileType !== 'dwg' && drawing.fileType !== 'dxf') {
    throw new Error(`${drawing.fileName} is not a CAD drawing`);
  }
  const space = drawing.layout ?? MODEL_SPACE;
  const cached = await readCachedDisplayList(dir, drawing.fileHash, space);
  if (cached) return cached;

  const file = await readFile(dir, `drawings/${drawing.fileName}`);
  const handle = await openCadFile(await file.arrayBuffer(), drawing.fileType);
  try {
    const list = await buildSpace(handle, space);
    // The cache is rebuildable; failing to write it must not stop the drawing opening.
    await writeCachedDisplayList(dir, drawing.fileHash, list).catch(() => {});
    return list;
  } finally {
    await closeCadFile(handle);
  }
}
