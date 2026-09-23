import { describe, expect, it } from 'vitest';
import { ProjectFileError, PROJECT_FILE_NAME } from '@/domain/schema';
import { writeFile } from '@/lib/fs/files';
import { createZip } from '@/lib/zip';
import { createMemoryFs } from '@/test/memory-fs';
import { makeProject } from '@/test/fixtures';
import { ProjectExistsError, createProjectInDirectory } from './project-io';
import { collectProjectFiles, extractProjectZip, projectZip, readProjectZip } from './project-zip';

const text = (s: string) => new TextEncoder().encode(s);

async function studyFolder() {
  const dir = createMemoryFs('study');
  await createProjectInDirectory(dir, makeProject({ name: 'Zip study' }));
  await writeFile(dir, 'drawings/PEFS-1.pdf', text('%PDF-1.7'));
  await writeFile(dir, 'templates/client.xlsx', text('xlsx'));
  await writeFile(dir, 'exports/2026-09-23_1000/out.csv', text('a,b'));
  await writeFile(dir, 'cache/previews/x.png', text('png'));
  await writeFile(dir, '.backup/project-1.qrapc.json', text('{}'));
  await writeFile(dir, 'project.qrapc.json.tmp', text('{}'));
  return dir;
}

describe('project .zip (PRJ-08)', () => {
  it('packs the project without caches, backups or temporary files', async () => {
    const files = await collectProjectFiles(await studyFolder());
    expect(files.map((f) => f.name)).toEqual([
      'drawings/PEFS-1.pdf',
      'exports/2026-09-23_1000/out.csv',
      PROJECT_FILE_NAME,
      'templates/client.xlsx',
    ]);
  });

  it('round-trips into an empty folder', async () => {
    const source = await studyFolder();
    const zip = await projectZip(source);
    const target = createMemoryFs('copy');
    await extractProjectZip(await readProjectZip(await zip.arrayBuffer()), target);
    expect(target.tree()).toEqual([
      'drawings/',
      'drawings/PEFS-1.pdf',
      'exports/',
      'exports/2026-09-23_1000/',
      'exports/2026-09-23_1000/out.csv',
      PROJECT_FILE_NAME,
      'templates/',
      'templates/client.xlsx',
    ]);
    expect(target.textAt(PROJECT_FILE_NAME)).toBe(source.textAt(PROJECT_FILE_NAME));
    // Never over an existing project.
    await expect(
      extractProjectZip(await readProjectZip(await zip.arrayBuffer()), target),
    ).rejects.toBeInstanceOf(ProjectExistsError);
  });

  it('accepts a zipped folder and drops caches from hand-made archives', async () => {
    const zip = await createZip([
      { name: 'Study/project.qrapc.json', data: text('{}') },
      { name: 'Study/drawings/a.pdf', data: text('a') },
      { name: 'Study/cache/x.bin', data: text('x') },
    ]);
    const entries = await readProjectZip(await zip.arrayBuffer());
    expect(entries.map((e) => e.name)).toEqual([PROJECT_FILE_NAME, 'drawings/a.pdf']);
  });

  it('says so when the archive holds no project', async () => {
    const zip = await createZip([{ name: 'drawings/a.pdf', data: text('a') }]);
    await expect(readProjectZip(await zip.arrayBuffer())).rejects.toBeInstanceOf(ProjectFileError);
  });
});
