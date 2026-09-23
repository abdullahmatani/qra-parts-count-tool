import { beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_FILE_NAME, parseProjectFile, serializeProject } from '@/domain/schema';
import { writeTextAtomic } from '@/lib/fs/files';
import { createMemoryFs, type MemoryDirectoryHandle } from '@/test/memory-fs';
import { makePopulatedProject, makeProject } from '@/test/fixtures';
import {
  ProjectExistsError,
  TEMP_PROJECT_FILE,
  WORKDIR_FOLDERS,
  createProjectInDirectory,
  openProjectFromDirectory,
} from './project-io';

let dir: MemoryDirectoryHandle;

describe('project in the working directory', () => {
  beforeEach(() => {
    dir = createMemoryFs('study');
  });

  it('creates the folder structure and project file (PRJ-01, PRJ-02)', async () => {
    const project = makeProject();
    await createProjectInDirectory(dir, project);
    expect(dir.tree()).toEqual(
      [...WORKDIR_FOLDERS.map((f) => `${f}/`), PROJECT_FILE_NAME].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
    expect(parseProjectFile(dir.textAt(PROJECT_FILE_NAME)).project).toEqual(project);
  });

  it('accepts an existing folder with other content (PRJ-01)', async () => {
    await (await dir.getFileHandle('notes.txt', { create: true })).createWritable();
    await createProjectInDirectory(dir, makeProject());
    expect(dir.tree()).toContain('notes.txt');
    expect(dir.tree()).toContain(PROJECT_FILE_NAME);
  });

  it('never overwrites an existing project', async () => {
    await createProjectInDirectory(dir, makeProject());
    await expect(createProjectInDirectory(dir, makeProject())).rejects.toBeInstanceOf(
      ProjectExistsError,
    );
  });

  it('opens and validates a project, recreating missing folders (PRJ-03)', async () => {
    const project = makePopulatedProject();
    await createProjectInDirectory(dir, project);
    await dir.removeEntry('cache', { recursive: true });

    const opened = await openProjectFromDirectory(dir);
    expect(opened.doc.name).toBe(project.name);
    expect(Object.keys(opened.doc.markers)).toHaveLength(2);
    expect(opened.recoveredFromTemp).toBe(false);
    expect(opened.migratedFrom).toBeNull();
    expect(opened.integrityIssues).toEqual([]);
    expect(dir.tree()).toContain('cache/');
  });

  it('reports a folder without a project file', async () => {
    await expect(openProjectFromDirectory(dir)).rejects.toMatchObject({ kind: 'missing' });
  });

  it('reports an invalid project file', async () => {
    await writeTextAtomic(dir, PROJECT_FILE_NAME, '{"schemaVersion": 1, "name": 5}');
    await expect(openProjectFromDirectory(dir)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('recovers a newer, complete temporary file left by a crash (PRJ-04)', async () => {
    const project = makeProject({ revision: 3 });
    await createProjectInDirectory(dir, project);
    const newer = { ...project, revision: 4, client: 'Recovered client' };
    const tmp = await dir.getFileHandle(TEMP_PROJECT_FILE, { create: true });
    const w = await tmp.createWritable();
    await w.write(serializeProject(newer));
    await w.close();

    const opened = await openProjectFromDirectory(dir);
    expect(opened.recoveredFromTemp).toBe(true);
    expect(opened.doc.client).toBe('Recovered client');
    expect(dir.tree()).not.toContain(TEMP_PROJECT_FILE);
    expect(parseProjectFile(dir.textAt(PROJECT_FILE_NAME)).project.client).toBe('Recovered client');
  });

  it('discards a stale or corrupt temporary file', async () => {
    const project = makeProject({ revision: 5 });
    await createProjectInDirectory(dir, project);
    const tmp = await dir.getFileHandle(TEMP_PROJECT_FILE, { create: true });
    const w = await tmp.createWritable();
    await w.write('{"schemaVersion": 1, "trunc');
    await w.close();

    const opened = await openProjectFromDirectory(dir);
    expect(opened.recoveredFromTemp).toBe(false);
    expect(opened.doc.revision).toBe(5);
    expect(dir.tree()).not.toContain(TEMP_PROJECT_FILE);
  });

  it('uses the temporary file when the main file is missing', async () => {
    const project = makeProject({ revision: 2 });
    await writeTextAtomic(dir, TEMP_PROJECT_FILE, serializeProject(project));
    const opened = await openProjectFromDirectory(dir);
    expect(opened.recoveredFromTemp).toBe(true);
    expect(dir.tree()).toContain(PROJECT_FILE_NAME);
  });
});
