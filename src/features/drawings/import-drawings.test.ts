import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { beginSession, endSession } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { createMemoryFs, type MemoryDirectoryHandle } from '@/test/memory-fs';
import { makeProject } from '@/test/fixtures';
import { importDrawingFiles, type ImportDeps } from './import-drawings';

const A3 = { width: 1191, height: 842 };
const deps = (pages: number): ImportDeps => ({
  now: () => new Date('2026-09-23T10:00:00Z'),
  inspect: async () => ({
    pages: Array.from({ length: pages }, (_, i) => ({
      pageNumber: i + 1,
      size: A3,
      textFrameSize: A3,
      text: [
        { text: 'DRAWING NO.', x: 800, y: 760, width: 60, size: 9 },
        { text: `PEFS-200${i + 1}`, x: 800, y: 790, width: 120, size: 20 },
        { text: 'REV', x: 1050, y: 760, width: 20, size: 9 },
        { text: 'B', x: 1060, y: 790, width: 15, size: 22 },
      ],
    })),
  }),
});

let dir: MemoryDirectoryHandle;
const file = (name: string, content = name) => new File([content], name);

describe('drawing import (DRW-01, DRW-03, DRW-04)', () => {
  beforeEach(async () => {
    dir = createMemoryFs('study');
    await beginSession(dir, projectToDoc(makeProject()), { remember: false });
  });
  afterEach(async () => {
    await endSession();
  });

  it('copies the file into drawings/ and creates one drawing per page', async () => {
    const report = await importDrawingFiles([file('PEFS-2000.pdf')], undefined, deps(3));
    expect(report.imported).toEqual([{ fileName: 'PEFS-2000.pdf', pages: 3 }]);
    expect(dir.textAt('drawings/PEFS-2000.pdf')).toBe('PEFS-2000.pdf');
    const doc = useProjectStore.getState().doc!;
    const drawings = doc.drawingOrder.map((id) => doc.drawings[id]!);
    expect(drawings.map((d) => [d.page, d.drawingNo, d.revision, d.sheet])).toEqual([
      [1, 'PEFS-2001', 'B', '1'],
      [2, 'PEFS-2002', 'B', '2'],
      [3, 'PEFS-2003', 'B', '3'],
    ]);
    expect(drawings[0]!.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(useProjectStore.getState().past.at(-1)?.label).toBe('Import 3 drawings');
  });

  it('skips a file whose content was already imported', async () => {
    await importDrawingFiles([file('a.pdf', 'same')], undefined, deps(1));
    const report = await importDrawingFiles([file('renamed.pdf', 'same')], undefined, deps(1));
    expect(report.skipped).toEqual([{ fileName: 'renamed.pdf', reason: 'duplicate' }]);
    expect(useProjectStore.getState().doc!.drawingOrder).toHaveLength(1);
  });

  it('keeps different files with the same name side by side', async () => {
    await importDrawingFiles([file('pefs.pdf', 'one')], undefined, deps(1));
    await importDrawingFiles([file('pefs.pdf', 'two')], undefined, deps(1));
    expect(dir.tree()).toEqual(
      expect.arrayContaining(['drawings/pefs.pdf', 'drawings/pefs (2).pdf']),
    );
  });

  it('reuses its own copy after an undone import', async () => {
    await importDrawingFiles([file('pefs.pdf', 'one')], undefined, deps(1));
    useProjectStore.getState().undo();
    await importDrawingFiles([file('pefs.pdf', 'one')], undefined, deps(1));
    expect(dir.tree().filter((p) => p.startsWith('drawings/pefs'))).toEqual(['drawings/pefs.pdf']);
  });

  it('reports unsupported and unreadable files', async () => {
    const failing: ImportDeps = {
      ...deps(1),
      inspect: async () => Promise.reject(new Error('bad PDF')),
    };
    const report = await importDrawingFiles(
      [file('notes.txt'), file('broken.pdf')],
      undefined,
      failing,
    );
    expect(report.skipped).toEqual([
      { fileName: 'notes.txt', reason: 'unsupported' },
      { fileName: 'broken.pdf', reason: 'failed', detail: 'bad PDF' },
    ]);
    expect(dir.tree()).not.toContain('drawings/broken.pdf');
  });
});
