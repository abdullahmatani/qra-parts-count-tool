import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { PROJECT_FILE_NAME, parseProjectFile } from '@/domain/schema';
import { useProjectStore } from '@/store/project-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { createMemoryFs, type MemoryDirectoryHandle } from '@/test/memory-fs';
import { makeProject } from '@/test/fixtures';
import { createProjectInDirectory } from './project-io';
import { AutosaveController } from './autosave';
import { listSnapshots } from './backups';

let dir: MemoryDirectoryHandle;
let controller: AutosaveController;
let clock: number;

const edit = (name: string) =>
  useProjectStore.getState().apply('Rename', (d) => {
    d.name = name;
  });
const saved = () => parseProjectFile(dir.textAt(PROJECT_FILE_NAME)).project;
/** Advances fake time and lets pending promises settle. */
async function advance(ms: number) {
  clock += ms;
  await vi.advanceTimersByTimeAsync(ms);
}

describe('autosave (PRJ-04, PRJ-05, NFR-05)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    clock = Date.UTC(2026, 8, 23, 10, 0, 0);
    vi.setSystemTime(clock);
    dir = createMemoryFs('study');
    const project = makeProject({ revision: 1 });
    await createProjectInDirectory(dir, project);
    useProjectStore.getState().load(projectToDoc(project));
    useWorkspaceStore.getState().reset();
    controller = new AutosaveController({
      debounceMs: 750,
      maxWaitMs: 1500,
      retryMs: 5000,
      snapshotIntervalMs: 60_000,
      appVersion: 'test',
      now: () => new Date(clock),
    });
    controller.start(dir, { snapshotOnStart: false });
  });

  afterEach(() => {
    controller.stop();
    useProjectStore.getState().close();
    vi.useRealTimers();
  });

  it('saves within 2 s of the last edit', async () => {
    edit('First edit');
    expect(useWorkspaceStore.getState().saveStatus).toBe('pending');
    await advance(700);
    expect(saved().name).toBe('Test project');
    await advance(100);
    expect(saved().name).toBe('First edit');
    expect(saved().revision).toBe(2);
    expect(useWorkspaceStore.getState().saveStatus).toBe('saved');
    expect(useProjectStore.getState().doc?.revision).toBe(2);
  });

  it('saves during continuous editing at least every 1.5 s', async () => {
    for (let i = 0; i < 8; i += 1) {
      edit(`Typing ${i}`);
      await advance(300);
    }
    // 2.4 s of continuous edits: at least one save happened mid-stream.
    expect(saved().name).not.toBe('Test project');
    const inFlight = saved().name;
    await advance(1000);
    expect(saved().name).toBe('Typing 7');
    expect(inFlight).not.toBe('Typing 7');
  });

  it('writes atomically and leaves no temporary file behind', async () => {
    edit('Atomic');
    await advance(800);
    expect(dir.tree()).not.toContain(`${PROJECT_FILE_NAME}.tmp`);
  });

  it('keeps the edits and retries when a save fails', async () => {
    dir.faults = { failCloseOf: `${PROJECT_FILE_NAME}.tmp` };
    edit('Will fail first');
    await advance(800);
    expect(useWorkspaceStore.getState().saveStatus).toBe('error');
    expect(saved().name).toBe('Test project');
    dir.faults = {};
    await advance(5000);
    expect(saved().name).toBe('Will fail first');
    expect(useWorkspaceStore.getState().saveStatus).toBe('saved');
  });

  it('takes a snapshot at most once per interval', async () => {
    edit('One');
    await advance(800);
    edit('Two');
    await advance(800);
    expect(await listSnapshots(dir)).toHaveLength(1);
    await advance(60_000);
    edit('Three');
    await advance(800);
    expect(await listSnapshots(dir)).toHaveLength(2);
  });

  it('flushes pending changes immediately', async () => {
    edit('Flushed');
    await controller.flush();
    expect(saved().name).toBe('Flushed');
  });

  it('does not save in read-only mode (PRJ-07)', async () => {
    useProjectStore.getState().setReadOnly(true);
    edit('Nope');
    await advance(2000);
    expect(saved().name).toBe('Test project');
  });
});
