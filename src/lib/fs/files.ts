/**
 * File helpers over {@link FsDirHandle}. Paths use forward slashes and are
 * relative to the given directory, e.g. `drawings/PEFS-001.pdf`.
 */
import { isNotFound, type FsDirHandle, type FsFileHandle, type WriteData } from './types';

export function splitPath(path: string): string[] {
  return path.split('/').filter((part) => part && part !== '.');
}

/** Resolves a sub-directory, optionally creating each level. */
export async function getDirectory(
  root: FsDirHandle,
  path: string,
  options: { create?: boolean } = {},
): Promise<FsDirHandle> {
  let dir = root;
  for (const part of splitPath(path)) {
    dir = await dir.getDirectoryHandle(part, { create: options.create ?? false });
  }
  return dir;
}

/** Splits a file path into its directory handle and file name. */
export async function resolveFile(
  root: FsDirHandle,
  path: string,
  options: { create?: boolean } = {},
): Promise<{ dir: FsDirHandle; name: string }> {
  const parts = splitPath(path);
  const name = parts.pop();
  if (!name) throw new Error(`Invalid file path "${path}"`);
  const dir = await getDirectory(root, parts.join('/'), options);
  return { dir, name };
}

export async function getFileHandle(
  root: FsDirHandle,
  path: string,
  options: { create?: boolean } = {},
): Promise<FsFileHandle> {
  const { dir, name } = await resolveFile(root, path, options);
  return dir.getFileHandle(name, { create: options.create ?? false });
}

export async function exists(root: FsDirHandle, path: string): Promise<boolean> {
  try {
    const { dir, name } = await resolveFile(root, path);
    try {
      await dir.getFileHandle(name);
      return true;
    } catch (error) {
      if (!isNotFound(error) && (error as { name?: string }).name !== 'TypeMismatchError') {
        throw error;
      }
      await dir.getDirectoryHandle(name);
      return true;
    }
  } catch (error) {
    if (isNotFound(error) || (error as { name?: string }).name === 'TypeMismatchError') {
      return false;
    }
    throw error;
  }
}

export async function readFile(root: FsDirHandle, path: string): Promise<File> {
  const handle = await getFileHandle(root, path);
  return handle.getFile();
}

export async function readText(root: FsDirHandle, path: string): Promise<string> {
  return (await readFile(root, path)).text();
}

/** Reads a text file, or returns null when it does not exist. */
export async function readTextIfExists(root: FsDirHandle, path: string): Promise<string | null> {
  try {
    return await readText(root, path);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Writes a whole file. In Chromium, `createWritable()` writes to a swap file
 * that replaces the target only on `close()`, so readers never see a partial file.
 */
export async function writeFile(root: FsDirHandle, path: string, data: WriteData): Promise<void> {
  const handle = await getFileHandle(root, path, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

export async function removeIfExists(
  root: FsDirHandle,
  path: string,
  options: { recursive?: boolean } = {},
): Promise<boolean> {
  try {
    const { dir, name } = await resolveFile(root, path);
    await dir.removeEntry(name, options);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}

export async function listEntries(root: FsDirHandle, path = ''): Promise<DirEntry[]> {
  const dir = await getDirectory(root, path);
  const entries: DirEntry[] = [];
  for await (const [name, handle] of dir.entries()) entries.push({ name, kind: handle.kind });
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export type AtomicWriteStrategy = 'move' | 'replace';

/**
 * Writes a file so that a crash never leaves it half-written (PRJ-04):
 *
 * 1. write the full content to `<name>.tmp`;
 * 2. rename the temporary file over the target (`move`), or where rename is not
 *    available, rewrite the target from the complete content and delete the
 *    temporary file.
 *
 * If the app stops between the steps, the complete `.tmp` file remains and is
 * picked up by recovery when the project is next opened.
 */
export async function writeTextAtomic(
  root: FsDirHandle,
  path: string,
  content: string,
): Promise<AtomicWriteStrategy> {
  const { dir, name } = await resolveFile(root, path, { create: true });
  const tmpName = `${name}.tmp`;
  const tmp = await dir.getFileHandle(tmpName, { create: true });
  const writable = await tmp.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }

  if (typeof tmp.move === 'function') {
    try {
      await tmp.move(dir, name);
      return 'move';
    } catch {
      // Some implementations refuse to replace an existing file; fall through.
    }
  }
  const target = await dir.getFileHandle(name, { create: true });
  const out = await target.createWritable();
  try {
    await out.write(content);
    await out.close();
  } catch (error) {
    await out.abort().catch(() => {});
    throw error;
  }
  await dir.removeEntry(tmpName).catch(() => {});
  return 'replace';
}

/**
 * Returns a file name that does not exist in `dir` and is not `reserved`,
 * adding ` (2)`, ` (3)` … before the extension when needed.
 */
export async function uniqueFileName(
  dir: FsDirHandle,
  fileName: string,
  reserved: Iterable<string> = [],
): Promise<string> {
  const taken = new Set<string>();
  for await (const [name] of dir.entries()) taken.add(name.toLowerCase());
  for (const name of reserved) taken.add(name.toLowerCase());
  if (!taken.has(fileName.toLowerCase())) return fileName;
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  for (let i = 2; ; i += 1) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Makes a string safe to use as a file name on Windows, macOS and Linux. */
export function sanitizeFileName(name: string, fallback = 'file'): string {
  const cleaned = name
    // Control characters are invalid in file names on every platform.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
  if (!cleaned || reserved.test(cleaned)) return fallback;
  return cleaned.slice(0, 180);
}
