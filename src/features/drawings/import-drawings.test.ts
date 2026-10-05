import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { beginSession, endSession } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { createMemoryFs, type MemoryDirectoryHandle } from '@/test/memory-fs';
import { makeProject } from '@/test/fixtures';
import { buildDisplayList, listSpaces } from '@/features/cad/display-list';
import { emptyCadDocument, type CadDocument } from '@/features/cad/model';
import type { CadHandle } from '@/features/cad/cad-client';
import {
  defaultSpaces,
  importDrawingFiles,
  type CadCandidate,
  type ImportDeps,
} from './import-drawings';

const A3 = { width: 1191, height: 842 };
const noCad: ImportDeps['cad'] = {
  available: () => false,
  open: () => Promise.reject(new Error('no CAD in this test')),
  build: () => Promise.reject(new Error('no CAD in this test')),
  close: async () => {},
  writeCache: async () => {},
};

const deps = (pages: number, producer = 'pdf-lib'): ImportDeps => ({
  now: () => new Date('2026-09-23T10:00:00Z'),
  cad: noCad,
  chooseSpaces: async () => null,
  inspect: async () => ({
    producer,
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

function cadDoc(): CadDocument {
  const doc = emptyCadDocument('test');
  doc.units = 4;
  const text = (value: string, x: number, y: number, height: number) => ({
    layer: '0',
    color: { kind: 'byLayer' as const },
    type: 'text' as const,
    position: [x, y] as [number, number],
    height,
    rotation: 0,
    widthFactor: 1,
    hAlign: 0,
    vAlign: 0,
    text: value,
  });
  doc.modelSpace.push(
    { layer: '0', color: { kind: 'byLayer' }, type: 'line', start: [0, 0], end: [841, 594] },
    text('DRAWING NO.', 660, 35, 2),
    text('PEFS-9001', 660, 22, 7),
    text('REV', 800, 35, 2),
    text('C', 805, 20, 8),
  );
  doc.layouts.push({ name: 'Sheet A', tabOrder: 1, entities: [] });
  return doc;
}

describe('CAD import (DRW-02, DRW-10)', () => {
  const opened: string[] = [];
  const closed: number[] = [];
  const cached: string[] = [];
  const cad = (available = true): ImportDeps['cad'] => ({
    available: () => available,
    open: async (_bytes, fileType) => {
      opened.push(fileType);
      const doc = cadDoc();
      return {
        docId: 7,
        fileType,
        spaces: listSpaces(doc),
        source: 'test',
        unsupported: {},
      } as CadHandle;
    },
    build: async (_handle, space) => buildDisplayList(cadDoc(), space),
    close: async (handle) => void closed.push(handle.docId),
    writeCache: async (_dir, _hash, list) => void cached.push(list.space),
  });

  beforeEach(async () => {
    opened.length = 0;
    closed.length = 0;
    cached.length = 0;
    dir = createMemoryFs('study');
    await beginSession(dir, projectToDoc(makeProject()), { remember: false });
  });
  afterEach(async () => {
    await endSession();
  });

  it('preselects paper layouts with content, otherwise model space', () => {
    expect(defaultSpaces([{ name: 'Model', entities: 10, viewports: 0 }])).toEqual(['Model']);
    expect(
      defaultSpaces([
        { name: 'Model', entities: 10, viewports: 0 },
        { name: 'A1', entities: 12, viewports: 1 },
        { name: 'Empty', entities: 1, viewports: 0 },
      ]),
    ).toEqual(['A1']);
  });

  it('imports the chosen spaces as drawings with title-block metadata and a cached display list', async () => {
    const chosen: string[][] = [];
    const report = await importDrawingFiles([file('PEFS-9001.dxf', 'dxf content')], undefined, {
      ...deps(1),
      cad: cad(),
      chooseSpaces: async (candidates) => {
        expect(candidates[0]).toMatchObject({
          fileName: 'PEFS-9001.dxf',
          fileType: 'dxf',
          defaultSpaces: ['Model'],
          importedSpaces: [],
        });
        chosen.push(candidates[0]!.defaultSpaces);
        return [['Model']];
      },
    });
    expect(report.imported).toEqual([{ fileName: 'PEFS-9001.dxf', pages: 1 }]);
    const doc = useProjectStore.getState().doc!;
    const drawing = doc.drawings[doc.drawingOrder[0]!]!;
    expect(drawing).toMatchObject({
      fileType: 'dxf',
      layout: 'Model',
      page: null,
      drawingNo: 'PEFS-9001',
      revision: 'C',
    });
    expect(drawing.size.width).toBeGreaterThan(2384);
    expect(cached).toEqual(['Model']);
    expect(closed).toEqual([7]);
    expect(dir.tree()).toContain('drawings/PEFS-9001.dxf');
  });

  it('skips a CAD file when no space is chosen, without copying it', async () => {
    const report = await importDrawingFiles([file('x.dxf', 'x')], undefined, {
      ...deps(1),
      cad: cad(),
      chooseSpaces: async () => null,
    });
    expect(report.skipped).toEqual([{ fileName: 'x.dxf', reason: 'noSpaces' }]);
    expect(dir.tree()).not.toContain('drawings/x.dxf');
    expect(closed).toEqual([7]);
  });

  it('offers only the layouts that are not drawings yet when a file is imported again', async () => {
    const options = { ...deps(1), cad: cad() };
    await importDrawingFiles([file('PEFS-9001.dxf', 'dxf content')], undefined, {
      ...options,
      chooseSpaces: async () => [['Model']],
    });
    const offered: CadCandidate[] = [];
    const report = await importDrawingFiles([file('PEFS-9001.dxf', 'dxf content')], undefined, {
      ...options,
      chooseSpaces: async (candidates) => {
        offered.push(...candidates);
        return [['Model', 'Sheet A']];
      },
    });
    expect(offered[0]).toMatchObject({ importedSpaces: ['Model'], defaultSpaces: [] });
    expect(report.imported).toEqual([{ fileName: 'PEFS-9001.dxf', pages: 1 }]);
    const doc = useProjectStore.getState().doc!;
    expect(doc.drawingOrder.map((id) => doc.drawings[id]!.layout)).toEqual(['Model', 'Sheet A']);
  });

  it('reports a CAD file as in the project when no new layout is chosen from it', async () => {
    const options = { ...deps(1), cad: cad() };
    await importDrawingFiles([file('a.dxf', 'a')], undefined, {
      ...options,
      chooseSpaces: async () => [['Model']],
    });
    const report = await importDrawingFiles([file('a.dxf', 'a')], undefined, options);
    expect(report.skipped).toEqual([{ fileName: 'a.dxf', reason: 'duplicate' }]);
  });

  it('skips a CAD file whose every layout is a drawing already, without asking', async () => {
    const options = { ...deps(1), cad: cad() };
    await importDrawingFiles([file('a.dxf', 'a')], undefined, {
      ...options,
      chooseSpaces: async () => [['Model', 'Sheet A']],
    });
    const chooseSpaces = vi.fn(async () => null);
    const report = await importDrawingFiles([file('a.dxf', 'a')], undefined, {
      ...options,
      chooseSpaces,
    });
    expect(report.skipped).toEqual([{ fileName: 'a.dxf', reason: 'duplicate' }]);
    expect(chooseSpaces).not.toHaveBeenCalled();
    expect(closed).toEqual([7, 7]);
  });

  it('does not copy a CAD file whose layout cannot be built', async () => {
    const report = await importDrawingFiles([file('x.dxf', 'x')], undefined, {
      ...deps(1),
      cad: { ...cad(), build: () => Promise.reject(new Error('The CAD reader stopped')) },
      chooseSpaces: async () => [['Model']],
    });
    expect(report.skipped).toEqual([
      { fileName: 'x.dxf', reason: 'failed', detail: 'The CAD reader stopped' },
    ]);
    expect(dir.tree()).not.toContain('drawings/x.dxf');
    expect(closed).toEqual([7]);
  });

  it('reports DWG files when the build has no DWG reader', async () => {
    const report = await importDrawingFiles([file('x.dwg', 'x')], undefined, {
      ...deps(1),
      cad: cad(false),
    });
    expect(report.skipped).toEqual([{ fileName: 'x.dwg', reason: 'dwgUnavailable' }]);
    expect(opened).toEqual([]);
  });

  it('flags PDFs written by CAD plot drivers as CAD plots (DRW-10)', async () => {
    await importDrawingFiles(
      [file('plot.pdf', 'plot')],
      undefined,
      deps(1, 'AutoCAD 2024 - DWG To PDF.pc3'),
    );
    const doc = useProjectStore.getState().doc!;
    expect(doc.drawings[doc.drawingOrder[0]!]!.isCadPlot).toBe(true);
  });
});
