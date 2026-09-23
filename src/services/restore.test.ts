import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { PROJECT_FILE_NAME, parseProjectFile, serializeProject } from '@/domain/schema';
import { useProjectStore } from '@/store/project-store';
import { createMemoryFs } from '@/test/memory-fs';
import { makeProject } from '@/test/fixtures';
import { autosave } from './autosave';
import { listSnapshots, takeSnapshot } from './backups';
import { createProjectInDirectory } from './project-io';
import { restoreSnapshot } from './restore';
import { beginSession, endSession } from './session';

describe('restore snapshot (PRJ-05)', () => {
  afterEach(async () => {
    await endSession();
    autosave.stop();
  });

  it('restores a snapshot, keeps the current state as a snapshot and saves', async () => {
    const dir = createMemoryFs('study');
    const original = makeProject({ name: 'Original', revision: 4 });
    await createProjectInDirectory(dir, { ...original, name: 'Current' });
    const snapshotName = await takeSnapshot(
      dir,
      serializeProject(original),
      4,
      new Date('2026-09-01T00:00:00Z'),
    );
    await beginSession(dir, projectToDoc({ ...original, name: 'Current' }), { remember: false });
    autosave.start(dir, { snapshotOnStart: false });

    await restoreSnapshot(snapshotName, new Date('2026-09-23T00:00:00Z'));

    expect(useProjectStore.getState().doc?.name).toBe('Original');
    expect(useProjectStore.getState().past).toHaveLength(0);
    const onDisk = parseProjectFile(dir.textAt(PROJECT_FILE_NAME)).project;
    expect(onDisk.name).toBe('Original');
    expect(onDisk.revision).toBeGreaterThan(4);
    const snapshots = await listSnapshots(dir);
    expect(snapshots.map((s) => s.fileName)).toContain(snapshotName);
    // The original, the state before the restore, and the save of the restored state.
    expect(snapshots).toHaveLength(3);
  });
});
