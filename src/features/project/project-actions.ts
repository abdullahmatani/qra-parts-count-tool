/**
 * Interactive project flows: pick a folder, create, open, reopen, close.
 */
import { starterLibrary } from '@/domain/count/starter-library';
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
import {
  projectLockName,
  tryLockProject,
  waitForProjectLock,
  type ProjectLock,
} from '@/services/project-lock';
import { ensurePermission, type RecentProject } from '@/services/recent-projects';
import {
  beginSession,
  endSession,
  getWorkingDirectory,
  sessionLockWaitSignal,
} from '@/services/session';

const t = i18n.t.bind(i18n);

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** The browser allows one picker at a time; a second call throws until the first settles. */
let pickerOpen = false;

/**
 * Shows the folder picker; returns null when the user cancels or the picker
 * cannot be used (in which case the user is told why).
 */
export async function pickWorkingDirectory(): Promise<FsDirHandle | null> {
  if (pickerOpen) {
    toast.info(t('project.folderPicker.busy'));
    return null;
  }
  pickerOpen = true;
  try {
    const handle = await window.showDirectoryPicker({ id: 'qrapc-workdir', mode: 'readwrite' });
    return fromNativeDirectory(handle);
  } catch (error) {
    if (!isAbort(error)) {
      toast.error(t('project.folderPicker.failed'), {
        description: `${error instanceof Error ? error.message : String(error)} ${t('project.folderPicker.failedHint')}`,
        duration: 15_000,
      });
    }
    return null;
  } finally {
    pickerOpen = false;
  }
}

export async function createNewProject(
  dir: FsDirHandle,
  input: NewProjectInput,
): Promise<'created' | 'exists'> {
  // CNT-02: a new project starts from the starter library, edited to suit.
  const project = createProject({
    ...input,
    library: input.library ?? starterLibrary(),
    appVersion: __APP_VERSION__,
  });
  try {
    await createProjectInDirectory(dir, project);
  } catch (error) {
    if (error instanceof ProjectExistsError) return 'exists';
    throw error;
  }
  const lock = await tryLockProject(projectLockName(project.id, dir.name));
  await beginSession(dir, projectToDoc(project), { savedAt: new Date(), lock });
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

/**
 * PRJ-07: in a tab that opened the project read-only, waits for the other tab
 * to let go, then offers to reopen the project (from disk) for editing.
 */
function offerEditingWhenFree(dir: FsDirHandle, name: string): void {
  const signal = sessionLockWaitSignal();
  void waitForProjectLock(name, signal).then((lock) => {
    if (!lock) return;
    if (signal.aborted || getWorkingDirectory() !== dir) {
      lock.release();
      return;
    }
    signal.addEventListener('abort', () => lock.release(), { once: true });
    toast.info(t('project.toast.lockFree'), {
      duration: Infinity,
      action: {
        label: t('project.toast.reopenForEditing'),
        onClick: () => {
          if (getWorkingDirectory() !== dir) return;
          void endSession().then(() => openProject(dir));
        },
      },
    });
  });
}

/** Opens the project in `dir`; reports problems to the user. Returns success. */
export async function openProject(dir: FsDirHandle): Promise<boolean> {
  try {
    let lock: ProjectLock | null = null;
    let lockName = '';
    const opened = await openProjectFromDirectory(dir, new Date(), {
      claim: async (projectId) => {
        lockName = projectLockName(projectId, dir.name);
        lock = await tryLockProject(lockName);
        return lock !== null;
      },
    });
    const warnings = opened.integrityIssues.map((issue) => issue.message);
    await beginSession(dir, opened.doc, {
      savedAt: new Date(),
      warnings,
      readOnly: !opened.writable,
      lock,
    });
    if (!opened.writable) {
      toast.warning(t('project.toast.openElsewhere'), { duration: 15_000 });
      offerEditingWhenFree(dir, lockName);
    }
    if (opened.recoveredFromTemp && opened.writable) toast.warning(t('project.toast.recovered'));
    if (opened.migratedFrom !== null && opened.writable) {
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
