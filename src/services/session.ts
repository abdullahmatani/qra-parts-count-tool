/**
 * The open project session: which working directory is in use, and the stores
 * that hold its state. There is at most one session per browser tab.
 */
import type { ProjectDoc } from '@/domain/model';
import type { FsDirHandle } from '@/lib/fs/types';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { ProjectLock } from './project-lock';
import { rememberRecentProject } from './recent-projects';

let workingDirectory: FsDirHandle | null = null;
/** PRJ-07: the tab lock held while the project is open for editing. */
let sessionLock: ProjectLock | null = null;
/** Stops a read-only tab waiting for the lock when its session ends. */
let lockWait: AbortController | null = null;

type SessionHook = {
  onBegin?: (dir: FsDirHandle) => void;
  onEnd?: () => Promise<void> | void;
};
const hooks: SessionHook[] = [];

/** Lets services (autosave, tab lock) follow the session lifecycle. */
export function registerSessionHook(hook: SessionHook): () => void {
  hooks.push(hook);
  return () => {
    const index = hooks.indexOf(hook);
    if (index >= 0) hooks.splice(index, 1);
  };
}

export function getWorkingDirectory(): FsDirHandle | null {
  return workingDirectory;
}

/** Requires an open working directory. */
export function requireWorkingDirectory(): FsDirHandle {
  if (!workingDirectory) throw new Error('No working directory is open');
  return workingDirectory;
}

export interface BeginSessionOptions {
  readOnly?: boolean;
  warnings?: string[];
  /** The file on disk already matches the document (just created or opened). */
  savedAt?: Date;
  remember?: boolean;
  /** Held for the session and released when it ends (PRJ-07). */
  lock?: ProjectLock | null;
  /** PRJ-08: opened from a .zip into memory; nothing is saved. */
  inMemory?: boolean;
}

export async function beginSession(
  dir: FsDirHandle,
  doc: ProjectDoc,
  options: BeginSessionOptions = {},
): Promise<void> {
  workingDirectory = dir;
  sessionLock = options.lock ?? null;
  useUiStore.getState().reset();
  useProjectStore.getState().load(doc, { readOnly: options.readOnly });
  const workspace = useWorkspaceStore.getState();
  workspace.reset();
  workspace.setDirectory(dir.name);
  workspace.setOpenWarnings(options.warnings ?? []);
  workspace.setInMemory(options.inMemory ?? false);
  if (options.savedAt) workspace.markSaved(options.savedAt);
  for (const hook of hooks) hook.onBegin?.(dir);
  if (options.remember !== false) {
    await rememberRecentProject({
      projectId: doc.id,
      name: doc.name,
      directoryName: dir.name,
      openedAt: new Date().toISOString(),
      handle: dir,
    }).catch(() => {
      // Remembering is a convenience; failing to store the handle is not fatal.
    });
  }
}

/** Ends the session after letting services flush pending work (e.g. autosave). */
export async function endSession(): Promise<void> {
  for (const hook of [...hooks]) await hook.onEnd?.();
  workingDirectory = null;
  sessionLock?.release();
  sessionLock = null;
  lockWait?.abort();
  lockWait = null;
  useProjectStore.getState().close();
  useUiStore.getState().reset();
  useWorkspaceStore.getState().reset();
}

/** A signal that aborts when the current session ends (for a read-only tab's lock wait). */
export function sessionLockWaitSignal(): AbortSignal {
  lockWait?.abort();
  lockWait = new AbortController();
  return lockWait.signal;
}
