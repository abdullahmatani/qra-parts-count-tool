/**
 * The whole project as one .zip (PRJ-08): for sending to a checker, archiving,
 * or opening in browsers without folder access. The render cache, backups and
 * temporary files are left out; everything else in the working directory
 * (project file, drawings, templates, exports) goes in.
 */
import { ProjectFileError, PROJECT_FILE_NAME } from '@/domain/schema';
import { writeFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';
import { createZip, readZip, type ZipEntry } from '@/lib/zip';
import { ProjectExistsError, hasProjectFile } from './project-io';

const LEFT_OUT = new Set(['cache', '.backup']);

/** Files of the project folder, "/"-separated and sorted, without caches and backups. */
export async function collectProjectFiles(dir: FsDirHandle, path = ''): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    const rel = path ? `${path}/${name}` : name;
    if (handle.kind === 'directory') {
      if (!path && LEFT_OUT.has(name)) continue;
      out.push(...(await collectProjectFiles(handle, rel)));
    } else if (!name.endsWith('.tmp')) {
      out.push({ name: rel, data: new Uint8Array(await (await handle.getFile()).arrayBuffer()) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function projectZip(dir: FsDirHandle): Promise<Blob> {
  return createZip(await collectProjectFiles(dir));
}

/**
 * The project entries of a .zip. A single folder around everything (as zip
 * tools make when zipping a folder) is stripped; caches and backups are dropped.
 */
export async function readProjectZip(data: ArrayBuffer | Uint8Array): Promise<ZipEntry[]> {
  const entries = await readZip(data);
  let prefix = '';
  if (!entries.some((e) => e.name === PROJECT_FILE_NAME)) {
    const nested = entries.find((e) => e.name.endsWith(`/${PROJECT_FILE_NAME}`));
    const candidate = nested?.name.slice(0, -PROJECT_FILE_NAME.length) ?? '';
    if (!nested || candidate.split('/').length !== 2) {
      throw new ProjectFileError('missing', `The .zip holds no ${PROJECT_FILE_NAME}.`);
    }
    prefix = candidate;
  }
  return entries
    .filter((e) => e.name.startsWith(prefix))
    .map((e) => ({ ...e, name: e.name.slice(prefix.length) }))
    .filter((e) => !LEFT_OUT.has(e.name.split('/')[0]!) && !e.name.endsWith('.tmp'));
}

/** Writes the entries into an empty working directory (never over an existing project). */
export async function extractProjectZip(
  entries: readonly ZipEntry[],
  dir: FsDirHandle,
): Promise<void> {
  if (await hasProjectFile(dir)) throw new ProjectExistsError();
  // The project file last, so an interrupted extraction is not mistaken for a project.
  const ordered = [...entries].sort(
    (a, b) => Number(a.name === PROJECT_FILE_NAME) - Number(b.name === PROJECT_FILE_NAME),
  );
  for (const entry of ordered) await writeFile(dir, entry.name, entry.data);
}
