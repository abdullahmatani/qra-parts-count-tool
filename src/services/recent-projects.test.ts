import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { idbReset } from '@/lib/idb';
import { createMemoryFs } from '@/test/memory-fs';
import type { FsDirHandle } from '@/lib/fs/types';
import {
  MAX_RECENT_PROJECTS,
  ensurePermission,
  forgetRecentProject,
  listRecentProjects,
  rememberRecentProject,
} from './recent-projects';

// fake-indexeddb structured-clones values; a plain object stands in for a handle.
const handle = (name: string) => ({ kind: 'directory', name }) as unknown as FsDirHandle;

describe('recent projects (PRJ-06)', () => {
  afterEach(async () => {
    await idbReset();
    indexedDB.deleteDatabase('qrapc');
  });

  it('remembers projects newest first without duplicates', async () => {
    await rememberRecentProject({
      projectId: 'a',
      name: 'A',
      directoryName: 'a',
      openedAt: '2026-01-01T00:00:00.000Z',
      handle: handle('a'),
    });
    await rememberRecentProject({
      projectId: 'b',
      name: 'B',
      directoryName: 'b',
      openedAt: '2026-01-02T00:00:00.000Z',
      handle: handle('b'),
    });
    await rememberRecentProject({
      projectId: 'a',
      name: 'A renamed',
      directoryName: 'a',
      openedAt: '2026-01-03T00:00:00.000Z',
      handle: handle('a'),
    });
    const list = await listRecentProjects();
    expect(list.map((p) => p.name)).toEqual(['A renamed', 'B']);
    await forgetRecentProject('a');
    expect((await listRecentProjects()).map((p) => p.projectId)).toEqual(['b']);
  });

  it('keeps at most the configured number of projects', async () => {
    for (let i = 0; i < MAX_RECENT_PROJECTS + 3; i += 1) {
      await rememberRecentProject({
        projectId: `p${i}`,
        name: `P${i}`,
        directoryName: `p${i}`,
        openedAt: new Date(2026, 0, i + 1).toISOString(),
        handle: handle(`p${i}`),
      });
    }
    expect(await listRecentProjects()).toHaveLength(MAX_RECENT_PROJECTS);
  });

  it('re-requests folder permission when it has lapsed', async () => {
    const dir = createMemoryFs();
    dir.setPermission('prompt', 'granted');
    expect(await ensurePermission(dir)).toBe(true);
    dir.setPermission('prompt', 'denied');
    expect(await ensurePermission(dir)).toBe(false);
  });
});
