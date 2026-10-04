// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import type * as PdfjsModule from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import type { Overlay } from '@/domain/export/pdf-plan';
import type { DisplayList } from '@/features/cad/display-list';
import { PdfBuilder, PdfSourceError, type BuildJob } from './pdf-build';

type Pdfjs = typeof PdfjsModule;

const overlay: Overlay = { markers: [], legendTitle: 'Legend', legend: [], stamp: ['Plant A'] };

const list: DisplayList = {
  version: 1,
  space: 'A1',
  width: 2384,
  height: 1684,
  groups: [],
  stats: { paths: 0, segments: 0, fills: 0, texts: 0, blocks: 0 },
};

async function twoPages(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([842, 595]);
  doc.addPage([1191, 842]);
  return doc.save();
}

async function encrypted(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: 'Standard', V: 2, R: 3 });
  return doc.save();
}

const job = (pages: BuildJob['pages']): BuildJob => ({
  title: 'IS-01',
  createdAt: '2026-09-23T10:45:00.000Z',
  pages,
});

describe('PdfBuilder', () => {
  it('asks for sources once, then combines PDF pages and CAD layouts', async () => {
    const builder = new PdfBuilder();
    const request = job([
      { source: { kind: 'pdf', key: 'a', pageIndex: 1 }, overlay },
      { source: { kind: 'cad', list, mode: 'monochrome' }, overlay },
      { source: { kind: 'pdf', key: 'a', pageIndex: 0 }, overlay },
    ]);
    expect(builder.missing(request.pages)).toEqual(['a']);
    builder.addSource('a', await twoPages());
    expect(builder.missing(request.pages)).toEqual([]);

    const out = await PDFDocument.load(await builder.build(request));
    expect(out.getPages().map((p) => p.getSize())).toEqual([
      { width: 1191, height: 842 },
      { width: 2384, height: 1684 },
      { width: 842, height: 595 },
    ]);
    expect(out.getTitle()).toBe('IS-01');
    expect(out.getCreator()).toBe('QRA Parts Count Tool');
    expect(out.getCreationDate()?.toISOString()).toBe('2026-09-23T10:45:00.000Z');
  });

  it('writes a PDF a page at a time, with a bookmark to each section', async () => {
    const builder = new PdfBuilder();
    builder.addSource('a', await twoPages());
    const meta = { title: 'Plant A – All segments', createdAt: '2026-09-23T10:45:00.000Z' };
    // A PDF left unfinished (an export that failed part way) is dropped by the next start.
    await builder.start(meta);
    await builder.append({ source: { kind: 'cad', list, mode: 'color' }, overlay });
    await builder.start(meta);
    await builder.append({ source: { kind: 'pdf', key: 'a', pageIndex: 0 }, overlay });
    await builder.append({ source: { kind: 'cad', list, mode: 'color' }, overlay });
    await builder.append({ source: { kind: 'pdf', key: 'a', pageIndex: 1 }, overlay });
    const bytes = await builder.finish([
      { title: 'IS-01 – Gas', pageIndex: 0 },
      { title: 'IS-02', pageIndex: 2 },
      // A page the PDF does not have gets no bookmark.
      { title: 'IS-03', pageIndex: 3 },
    ]);
    await expect(builder.finish()).rejects.toThrow('No PDF has been started');

    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    try {
      const pdf = await task.promise;
      expect(pdf.numPages).toBe(3);
      expect((await pdf.getMetadata()).info).toMatchObject({ Title: 'Plant A – All segments' });
      const outline = await pdf.getOutline();
      const targets = await Promise.all(
        outline.map(async (entry) => {
          const [ref] = entry.dest as [{ num: number; gen: number }];
          return [entry.title, await pdf.getPageIndex(ref)];
        }),
      );
      expect(targets).toEqual([
        ['IS-01 – Gas', 0],
        ['IS-02', 2],
      ]);
    } finally {
      await task.destroy();
    }
  });

  it('takes pages from more source files than it keeps, supplied as each page needs them', async () => {
    const builder = new PdfBuilder();
    const bytes = await twoPages();
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    await builder.start({ title: 'All segments', createdAt: '2026-09-23T10:45:00.000Z' });
    // As the worker does for each `append`: ask for what the page lacks, then draw it.
    for (const key of keys) {
      const page = { source: { kind: 'pdf' as const, key, pageIndex: 0 }, overlay };
      for (const missing of builder.missing([page])) builder.addSource(missing, bytes);
      await builder.append(page);
    }
    const out = await PDFDocument.load(await builder.finish());
    expect(out.getPageCount()).toBe(keys.length);
  });

  it('keeps only the most recently used sources', async () => {
    const builder = new PdfBuilder();
    const bytes = await twoPages();
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) builder.addSource(key, bytes);
    const need = (key: string) => job([{ source: { kind: 'pdf', key, pageIndex: 0 }, overlay }]);
    expect(builder.missing(need('a').pages)).toEqual(['a']);
    expect(builder.missing(need('g').pages)).toEqual([]);
  });

  it('reports encrypted, unreadable and shortened source PDFs', async () => {
    const builder = new PdfBuilder();
    builder.addSource('locked', await encrypted());
    builder.addSource('junk', new TextEncoder().encode('not a pdf'));
    builder.addSource('short', await twoPages());
    const page = (key: string, pageIndex = 0) =>
      job([{ source: { kind: 'pdf', key, pageIndex }, overlay }]);

    const problem = (request: BuildJob) =>
      builder.build(request).then(
        () => null,
        (error: unknown) => (error instanceof PdfSourceError ? error.problem : error),
      );
    expect(await problem(page('locked'))).toBe('encrypted');
    expect(await problem(page('junk'))).toBe('unreadable');
    expect(await problem(page('short', 5))).toBe('missingPage');
  });
});
