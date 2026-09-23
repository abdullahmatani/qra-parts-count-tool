// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Overlay } from '@/domain/export/pdf-plan';
import type { DisplayList } from '@/features/cad/display-list';
import { PdfBuilder, PdfSourceError, type BuildJob } from './pdf-build';

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
    expect(builder.missing(request)).toEqual(['a']);
    builder.addSource('a', await twoPages());
    expect(builder.missing(request)).toEqual([]);

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

  it('keeps only the most recently used sources', async () => {
    const builder = new PdfBuilder();
    const bytes = await twoPages();
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) builder.addSource(key, bytes);
    const need = (key: string) => job([{ source: { kind: 'pdf', key, pageIndex: 0 }, overlay }]);
    expect(builder.missing(need('a'))).toEqual(['a']);
    expect(builder.missing(need('g'))).toEqual([]);
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
