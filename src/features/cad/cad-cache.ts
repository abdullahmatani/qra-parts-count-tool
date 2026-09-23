/**
 * Render cache for CAD drawings (FDS section 5: `cache/`, rebuildable). The
 * display list of each converted DWG/DXF space is stored gzipped, keyed by the
 * file hash, so a drawing opens without re-reading the DWG.
 */
import { getDirectory, readFile, writeFile } from '@/lib/fs/files';
import { isNotFound, type FsDirHandle } from '@/lib/fs/types';
import { DISPLAY_LIST_VERSION, type DisplayList } from './display-list';

export const CAD_CACHE_DIR = 'cache/cad';

/** File-name-safe key for a space name. */
export function spaceKey(space: string): string {
  const safe = space.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60);
  let hash = 0;
  for (const ch of space) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `${safe}-${(hash >>> 0).toString(36)}`;
}

export function cachePath(fileHash: string, space: string): string {
  return `${CAD_CACHE_DIR}/${fileHash}/${spaceKey(space)}.json.gz`;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Blob): Promise<string> {
  const stream = data.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function readCachedDisplayList(
  dir: FsDirHandle,
  fileHash: string,
  space: string,
): Promise<DisplayList | null> {
  try {
    const file = await readFile(dir, cachePath(fileHash, space));
    const list = JSON.parse(await gunzip(file)) as DisplayList;
    if (list.version !== DISPLAY_LIST_VERSION || list.space !== space) return null;
    return list;
  } catch (error) {
    // Missing or unreadable cache entries are simply rebuilt.
    if (!isNotFound(error)) console.warn('Ignoring unreadable CAD cache entry', error);
    return null;
  }
}

export async function writeCachedDisplayList(
  dir: FsDirHandle,
  fileHash: string,
  list: DisplayList,
): Promise<void> {
  await getDirectory(dir, `${CAD_CACHE_DIR}/${fileHash}`, { create: true });
  await writeFile(dir, cachePath(fileHash, list.space), await gzip(JSON.stringify(list)));
}
