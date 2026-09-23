/**
 * Interactive project flows: pick a folder, create, open, reopen, close.
 */
import { toast } from 'sonner';
import i18n from '@/i18n';
import { createProject, ProjectFileError, type NewProjectInput } from '@/domain/schema';
import { projectToDoc } from '@/domain/model';
import { fromNativeDirectory, type FsDirHandle } from '@/lib/fs/types';
import {
  ProjectExistsError,
  createProjectInDirectory,
  openProjectFromDirectory,
} from '@/services/project-io';
import { ensurePermission, type RecentProject } from '@/services/recent-projects';
import { beginSession, endSession } from '@/services/session';

const t = i18n.t.bind(i18n);

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Shows the folder picker; returns null when the user cancels. */
export async function pickWorkingDirectory(): Promise<FsDirHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({ id: 'qrapc-workdir', mode: 'readwrite' });
    return fromNativeDirectory(handle);
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

export async function createNewProject(
  dir: FsDirHandle,
  input: NewProjectInput,
): Promise<'created' | 'exists'> {
  const project = createProject({ ...input, appVersion: __APP_VERSION__ });
  try {
    await createProjectInDirectory(dir, project);
  } catch (error) {
    if (error instanceof ProjectExistsError) return 'exists';
    throw error;
  }
  await beginSession(dir, projectToDoc(project), { savedAt: new Date() });
  toast.success(t('project.toast.created', { name: project.name }));
  return 'created';
}

function reportOpenError(error: unknown): void {
  if (error instanceof ProjectFileError) {
    toast.error(t(`project.openErrors.${error.kind}`), {
      description: error.details ? error.details.slice(0, 400) : error.message,
      duration: 15_000,
    });
    return;
  }
  toast.error(t('project.openErrors.unexpected'), {
    description: error instanceof Error ? error.message : String(error),
  });
}

/** Opens the project in `dir`; reports problems to the user. Returns success. */
export async function openProject(dir: FsDirHandle): Promise<boolean> {
  try {
    const opened = await openProjectFromDirectory(dir);
    const warnings = opened.integrityIssues.map((issue) => issue.message);
    await beginSession(dir, opened.doc, { savedAt: new Date(), warnings });
    if (opened.recoveredFromTemp) toast.warning(t('project.toast.recovered'));
    if (opened.migratedFrom !== null) {
      toast.info(t('project.toast.migrated', { version: opened.migratedFrom }));
    }
    if (warnings.length > 0) {
      toast.warning(t('project.toast.integrity', { count: warnings.length }), {
        description: warnings.slice(0, 5).join('\n'),
      });
    }
    return true;
  } catch (error) {
    reportOpenError(error);
    return false;
  }
}

export async function openProjectFromPicker(): Promise<boolean> {
  const dir = await pickWorkingDirectory();
  return dir ? openProject(dir) : false;
}

/** Reopens a recent project, re-requesting folder permission (PRJ-06). */
export async function reopenRecentProject(recent: RecentProject): Promise<boolean> {
  const granted = await ensurePermission(recent.handle).catch(() => false);
  if (!granted) {
    toast.error(t('project.openErrors.permission', { name: recent.directoryName }));
    return false;
  }
  return openProject(recent.handle);
}

export async function closeProject(): Promise<void> {
  await endSession();
}
