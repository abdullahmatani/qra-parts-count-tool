/**
 * PRJ-08: the project as a single .zip — export it, open one into a folder,
 * or (in browsers without folder access) open one read-only in memory.
 */
import { toast } from 'sonner';
import i18n from '@/i18n';
import { downloadBlob } from '@/lib/download';
import { getDirectory, sanitizeFileName } from '@/lib/fs/files';
import { createMemoryFs } from '@/lib/fs/memory';
import type { FsDirHandle } from '@/lib/fs/types';
import { autosave } from '@/services/autosave';
import { openProjectFromDirectory } from '@/services/project-io';
import {
  collectProjectFiles,
  extractProjectZip,
  projectZip,
  readProjectZip,
} from '@/services/project-zip';
import { beginSession, getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { createZip } from '@/lib/zip';
import { openProject } from './project-actions';

const t = i18n.t.bind(i18n);

/** Downloads the open project as `<name>.qrapc.zip`, after saving pending edits. */
export async function exportProjectZip(): Promise<void> {
  const dir = getWorkingDirectory();
  const doc = useProjectStore.getState().doc;
  if (!dir || !doc) return;
  const toastId = toast.loading(t('zip.exporting'));
  try {
    await autosave.flush();
    const blob = await projectZip(dir);
    downloadBlob(`${sanitizeFileName(doc.name, 'project')}.qrapc.zip`, blob);
    toast.success(t('zip.exported'), { id: toastId });
  } catch (error) {
    toast.error(t('zip.exportFailed'), {
      id: toastId,
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Extracts a project .zip into an empty folder and opens it for editing. */
export async function openZipIntoFolder(file: File, dir: FsDirHandle): Promise<boolean> {
  const entries = await readProjectZip(await file.arrayBuffer());
  await extractProjectZip(entries, dir);
  return openProject(dir);
}

/**
 * Opens a project .zip read-only in memory, for browsers that cannot write to
 * folders (FDS section 2, risk R2). Drawings can be viewed and checked, and
 * exports are offered as a download.
 */
export async function openZipReadOnly(file: File): Promise<void> {
  const entries = await readProjectZip(await file.arrayBuffer());
  const dir = createMemoryFs(file.name.replace(/\.zip$/i, ''));
  await extractProjectZip(entries, dir);
  const opened = await openProjectFromDirectory(dir, new Date(), { claim: async () => false });
  await beginSession(dir, opened.doc, {
    readOnly: true,
    remember: false,
    inMemory: true,
    warnings: opened.integrityIssues.map((issue) => issue.message),
  });
  toast.info(t('zip.openedReadOnly', { file: file.name }), { duration: 10_000 });
}

/** Downloads one export folder (e.g. `exports/2026-09-23_104512`) as a .zip. */
export async function downloadExportFolder(folder: string): Promise<void> {
  const dir = getWorkingDirectory();
  if (!dir) return;
  const files = await collectProjectFiles(await getDirectory(dir, folder));
  const name = folder.split('/').pop() ?? 'exports';
  downloadBlob(`${name}.zip`, await createZip(files));
}
