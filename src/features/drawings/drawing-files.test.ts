import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { writeFile } from '@/lib/fs/files';
import { beginSession, endSession, registerSessionHook } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { createMemoryFs, type MemoryDirectoryHandle } from '@/test/memory-fs';
import { makeProject } from '@/test/fixtures';
import { deleteDrawingCommand } from './drawing-commands';
import { drawingFiles, installDrawingFiles } from './drawing-files';
import { importDrawingFiles, type ImportDeps } from './import-drawings';

const A3 = { width: 1191, height: 842 };
const deps = (pages: number): ImportDeps => ({
  now: () => new Date('2026-09-23T10:00:00Z'),
  cad: {
    available: () => false,
    open: () => Promise.reject(new Error('no CAD in this test')),
    build: () => Promise.reject(new Error('no CAD in this test')),
    close: async () => {},
    writeCache: async () => {},
  },
  chooseSpaces: async () => null,
  inspect: async () => ({
    producer: 'pdf-lib',
    pages: Array.from({ length: pages }, (_, i) => ({
      pageNumber: i + 1,
      size: A3,
      textFrameSize: A3,
      text: [],
    })),
  }),
});

let dir: MemoryDirectoryHandle;
let uninstall: () => void;
const beforeRemove = vi.fn(async () => {});
const file = (name: string, content = name) => new File([content], name);
const store = () => useProjectStore.getState();
const drawings = () => store().doc!.drawingOrder.map((id) => store().doc!.drawings[id]!);
const drawingFolder = () => dir.tree().filter((path) => path.startsWith('drawings/'));
const settle = () => drawingFiles.idle();

describe('files of deleted drawings (DRW-03, DRW-04)', () => {
  beforeEach(async () => {
    beforeRemove.mockClear();
    uninstall = installDrawingFiles(registerSessionHook, { beforeRemove });
    dir = createMemoryFs('study');
    await beginSession(dir, projectToDoc(makeProject()), { remember: false });
  });
  afterEach(async () => {
    await endSession();
    uninstall();
  });

  it('removes the file and its caches with the drawing; Undo and Redo bring them back and take them away', async () => {
    await importDrawingFiles([file('PEFS-1.pdf', 'one')], undefined, deps(1));
    const [drawing] = drawings();
    await writeFile(dir, `cache/previews/${drawing!.fileHash}-p1-1024-v1.png`, 'png');
    await writeFile(dir, `cache/previews/${'f'.repeat(64)}-p1-1024-v1.png`, 'other');

    deleteDrawingCommand(drawing!.id);
    await settle();
    expect(drawingFolder()).toEqual(['drawings/']);
    expect(dir.tree()).toContain(`cache/previews/${'f'.repeat(64)}-p1-1024-v1.png`);
    expect(dir.tree()).not.toContain(`cache/previews/${drawing!.fileHash}-p1-1024-v1.png`);
    expect(beforeRemove).toHaveBeenCalledOnce();

    store().undo();
    await settle();
    expect(drawings().map((d) => d.id)).toEqual([drawing!.id]);
    expect(dir.textAt('drawings/PEFS-1.pdf')).toBe('one');

    store().redo();
    await settle();
    expect(drawingFolder()).toEqual(['drawings/']);
  });

  it('keeps the file while another page of it is still a drawing', async () => {
    await importDrawingFiles([file('PEFS-2000.pdf')], undefined, deps(3));
    deleteDrawingCommand(drawings()[1]!.id);
    await settle();
    expect(drawingFolder()).toEqual(['drawings/', 'drawings/PEFS-2000.pdf']);
    expect(beforeRemove).not.toHaveBeenCalled();
  });

  it('imports a deleted drawing again', async () => {
    await importDrawingFiles([file('PEFS-1.pdf', 'one')], undefined, deps(1));
    deleteDrawingCommand(drawings()[0]!.id);
    // No waiting: the import queues behind the removal.
    const report = await importDrawingFiles([file('PEFS-1.pdf', 'one')], undefined, deps(1));
    await settle();
    expect(report.skipped).toEqual([]);
    expect(drawings().map((d) => d.fileName)).toEqual(['PEFS-1.pdf']);
    expect(dir.textAt('drawings/PEFS-1.pdf')).toBe('one');
  });

  it('brings back the deleted page of a multi-page file when the file is imported again', async () => {
    await importDrawingFiles([file('PEFS-2000.pdf')], undefined, deps(3));
    deleteDrawingCommand(drawings()[1]!.id);
    const report = await importDrawingFiles([file('PEFS-2000.pdf')], undefined, deps(3));
    expect(report.imported).toEqual([{ fileName: 'PEFS-2000.pdf', pages: 1 }]);
    expect(drawings().map((d) => d.page)).toEqual([1, 3, 2]);
    expect(drawingFolder()).toEqual(['drawings/', 'drawings/PEFS-2000.pdf']);
  });

  it('keeps the name of a deleted file for Undo when another file with that name is imported', async () => {
    await importDrawingFiles([file('pefs.pdf', 'one')], undefined, deps(1));
    deleteDrawingCommand(drawings()[0]!.id);
    await settle();
    await importDrawingFiles([file('pefs.pdf', 'two')], undefined, deps(1));
    expect(drawings().map((d) => d.fileName)).toEqual(['pefs (2).pdf']);

    store().undo(); // the second import
    store().undo(); // the deletion
    await settle();
    expect(drawings().map((d) => d.fileName)).toEqual(['pefs.pdf']);
    expect(drawingFolder()).toEqual(['drawings/', 'drawings/pefs.pdf']);
    expect(dir.textAt('drawings/pefs.pdf')).toBe('one');
  });

  it('removes the file of an undone import, and Redo brings it back', async () => {
    await importDrawingFiles([file('pefs.pdf', 'one')], undefined, deps(1));
    store().undo();
    await settle();
    expect(drawingFolder()).toEqual(['drawings/']);
    store().redo();
    await settle();
    expect(dir.textAt('drawings/pefs.pdf')).toBe('one');
  });

  it('never removes files when a document is loaded (opening a project, restoring a backup)', async () => {
    await importDrawingFiles([file('pefs.pdf', 'one')], undefined, deps(1));
    store().load(projectToDoc({ ...makeProject(), id: store().doc!.id }));
    await settle();
    expect(drawingFolder()).toEqual(['drawings/', 'drawings/pefs.pdf']);
  });
});
