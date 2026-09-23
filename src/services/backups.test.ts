import { describe, expect, it } from 'vitest';
import { serializeProject } from '@/domain/schema';
import { writeFile } from '@/lib/fs/files';
import { createMemoryFs } from '@/test/memory-fs';
import { makeProject } from '@/test/fixtures';
import {
  MAX_SNAPSHOTS,
  compactTimestamp,
  listSnapshots,
  readSnapshot,
  snapshotFileName,
  takeSnapshot,
} from './backups';

describe('autosave snapshots (PRJ-05)', () => {
  it('names snapshots with a sortable timestamp and revision', () => {
    const date = new Date('2026-09-23T10:42:05.123Z');
    expect(compactTimestamp(date)).toBe('20260923T104205123Z');
    expect(snapshotFileName(date, 12)).toBe('snapshot-20260923T104205123Z-r12.qrapc.json');
  });

  it('keeps only the last 20 snapshots, newest first', async () => {
    const dir = createMemoryFs();
    const text = serializeProject(makeProject());
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i += 1) {
      await takeSnapshot(dir, text, i + 1, new Date(Date.UTC(2026, 8, 23, 10, 0, i)));
    }
    const snapshots = await listSnapshots(dir);
    expect(snapshots).toHaveLength(MAX_SNAPSHOTS);
    expect(snapshots[0]!.revision).toBe(MAX_SNAPSHOTS + 5);
    expect(snapshots.at(-1)!.revision).toBe(6);
    expect(snapshots[0]!.savedAt.toISOString()).toBe('2026-09-23T10:00:24.000Z');
  });

  it('never prunes pre-migration backups or unrelated files', async () => {
    const dir = createMemoryFs();
    await writeFile(dir, '.backup/pre-migration-v1-x.qrapc.json', '{}');
    await writeFile(dir, '.backup/readme.txt', 'hi');
    const text = serializeProject(makeProject());
    for (let i = 0; i < MAX_SNAPSHOTS + 2; i += 1) {
      await takeSnapshot(dir, text, i, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    }
    const tree = dir.tree();
    expect(tree).toContain('.backup/pre-migration-v1-x.qrapc.json');
    expect(tree).toContain('.backup/readme.txt');
  });

  it('reads and validates a snapshot for restore', async () => {
    const dir = createMemoryFs();
    const project = makeProject({ name: 'Snapshot me' });
    const name = await takeSnapshot(dir, serializeProject(project), 3, new Date());
    expect((await readSnapshot(dir, name)).name).toBe('Snapshot me');
    await expect(readSnapshot(dir, '../project.qrapc.json')).rejects.toThrow();
  });

  it('returns no snapshots when the backup folder is missing', async () => {
    expect(await listSnapshots(createMemoryFs())).toEqual([]);
  });
});
