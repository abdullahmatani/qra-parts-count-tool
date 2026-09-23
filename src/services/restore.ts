import { projectToDoc } from '@/domain/model';
import { useProjectStore } from '@/store/project-store';
import { autosave } from './autosave';
import { readSnapshot, snapshotCurrentFile } from './backups';
import { requireWorkingDirectory } from './session';

/**
 * Restores an autosave snapshot (PRJ-05). The current file is snapshotted first,
 * so a restore can itself be undone by restoring that snapshot.
 */
export async function restoreSnapshot(fileName: string, now: Date = new Date()): Promise<void> {
  const dir = requireWorkingDirectory();
  await autosave.flush();
  const project = await readSnapshot(dir, fileName);
  await snapshotCurrentFile(dir, now);
  const current = useProjectStore.getState().doc;
  // Keep revisions increasing so crash recovery never prefers an older file.
  const revision = Math.max(project.revision, current?.revision ?? 0);
  useProjectStore.getState().load(projectToDoc({ ...project, revision }));
  await autosave.requestSave();
}
