/**
 * Autosave snapshots in `.backup/` (PRJ-05). The last {@link MAX_SNAPSHOTS}
 * snapshots are kept; older ones are deleted. Pre-migration backups written
 * when an older file is upgraded are kept separately and never pruned.
 */
import { PROJECT_FILE_NAME, parseProjectFile, type Project } from '@/domain/schema';
import { getDirectory, readText, writeFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';

export const MAX_SNAPSHOTS = 20;
export const BACKUP_DIR = '.backup';
const SNAPSHOT_PATTERN = /^snapshot-(\d{8}T\d{6}(?:\d{3})?Z)-r(\d+)\.qrapc\.json$/;

export interface SnapshotInfo {
  fileName: string;
  savedAt: Date;
  revision: number;
  size: number;
}

/** Compact, sortable UTC timestamp, e.g. 20260923T104200123Z. */
export function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('.', '');
}

function parseCompactTimestamp(stamp: string): Date {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})?Z$/);
  if (!m) return new Date(Number.NaN);
  const [, y, mo, d, h, mi, s, ms] = m;
  return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!, ms ? +ms : 0));
}

export function snapshotFileName(savedAt: Date, revision: number): string {
  return `snapshot-${compactTimestamp(savedAt)}-r${revision}.qrapc.json`;
}

export async function listSnapshots(dir: FsDirHandle): Promise<SnapshotInfo[]> {
  let backup: FsDirHandle;
  try {
    backup = await getDirectory(dir, BACKUP_DIR);
  } catch {
    return [];
  }
  const snapshots: SnapshotInfo[] = [];
  for await (const [name, handle] of backup.entries()) {
    const match = name.match(SNAPSHOT_PATTERN);
    if (!match || handle.kind !== 'file') continue;
    const file = await handle.getFile();
    snapshots.push({
      fileName: name,
      savedAt: parseCompactTimestamp(match[1]!),
      revision: Number(match[2]),
      size: file.size,
    });
  }
  return snapshots.sort((a, b) => b.fileName.localeCompare(a.fileName));
}

/** Writes a snapshot and prunes the oldest beyond {@link MAX_SNAPSHOTS}. */
export async function takeSnapshot(
  dir: FsDirHandle,
  text: string,
  revision: number,
  savedAt: Date,
): Promise<string> {
  const fileName = snapshotFileName(savedAt, revision);
  await writeFile(dir, `${BACKUP_DIR}/${fileName}`, text);
  await pruneSnapshots(dir);
  return fileName;
}

export async function pruneSnapshots(dir: FsDirHandle, keep = MAX_SNAPSHOTS): Promise<string[]> {
  const snapshots = await listSnapshots(dir);
  const backup = await getDirectory(dir, BACKUP_DIR);
  const removed: string[] = [];
  for (const snapshot of snapshots.slice(keep)) {
    await backup.removeEntry(snapshot.fileName);
    removed.push(snapshot.fileName);
  }
  return removed;
}

/** Reads and validates a snapshot, ready to restore. */
export async function readSnapshot(dir: FsDirHandle, fileName: string): Promise<Project> {
  if (!SNAPSHOT_PATTERN.test(fileName)) throw new Error(`Not a snapshot: ${fileName}`);
  const text = await readText(dir, `${BACKUP_DIR}/${fileName}`);
  return parseProjectFile(text).project;
}

/** Snapshot of the project file exactly as it is on disk (e.g. before a restore). */
export async function snapshotCurrentFile(dir: FsDirHandle, now: Date): Promise<string | null> {
  try {
    const text = await readText(dir, PROJECT_FILE_NAME);
    const { project } = parseProjectFile(text);
    return await takeSnapshot(dir, text, project.revision, now);
  } catch {
    return null;
  }
}
