/**
 * Recently opened projects (PRJ-06). The folder handle is remembered in
 * IndexedDB; on reopen the browser asks the user to grant access again.
 */
import { idbGet, idbSet } from '@/lib/idb';
import type { FsDirHandle, PermissionMode } from '@/lib/fs/types';

export interface RecentProject {
  projectId: string;
  name: string;
  directoryName: string;
  openedAt: string;
  handle: FsDirHandle;
}

const KEY = 'recentProjects';
export const MAX_RECENT_PROJECTS = 10;

export async function listRecentProjects(): Promise<RecentProject[]> {
  try {
    const list = (await idbGet<RecentProject[]>(KEY)) ?? [];
    return [...list].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  } catch {
    return [];
  }
}

export async function rememberRecentProject(entry: RecentProject): Promise<void> {
  const list = (await listRecentProjects()).filter((p) => p.projectId !== entry.projectId);
  await idbSet(KEY, [entry, ...list].slice(0, MAX_RECENT_PROJECTS));
}

export async function forgetRecentProject(projectId: string): Promise<void> {
  const list = await listRecentProjects();
  await idbSet(
    KEY,
    list.filter((p) => p.projectId !== projectId),
  );
}

/**
 * Makes sure the app may read (and write) the folder, asking the user if needed
 * (PRJ-06, risk R6). Must be called from a user gesture when a prompt is likely.
 */
export async function ensurePermission(
  handle: FsDirHandle,
  mode: PermissionMode = 'readwrite',
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
}
