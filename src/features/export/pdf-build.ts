/**
 * Builds annotated PDFs a page at a time (EXP-03, EXP-04). Runs in the PDF
 * export worker; also usable directly (tests). Source PDFs are parsed once
 * and kept while successive pages and outputs use them, since a multi-page PDF
 * often holds many drawings and segment PDFs revisit the same files.
 */
import { PDFDocument, PDFHexString, PDFName, type PDFRef } from 'pdf-lib';
import { addAnnotatedPdfPage, addCadPage, embedFonts, type Fonts } from './pdf-annotate';
import {
  PdfSourceError,
  type BuildJob,
  type BuildPage,
  type OutlineEntry,
  type PdfMeta,
} from './pdf-export-protocol';

export { PdfSourceError };
export type { BuildJob, BuildPage, PageSource } from './pdf-export-protocol';

const SOURCE_CAPACITY = 6;

async function load(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    // Checked below instead: pdf-lib's own error does not survive instanceof.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (error) {
    throw new PdfSourceError('unreadable', error instanceof Error ? error.message : String(error));
  }
  // pdf-lib cannot decrypt, and copied pages would be unreadable.
  if (doc.isEncrypted) throw new PdfSourceError('encrypted', 'The PDF is encrypted');
  return doc;
}

/**
 * Bookmarks (a flat document outline), each opening its page fitted to the
 * window; the reader shows them when the file opens.
 */
function addOutline(doc: PDFDocument, entries: readonly OutlineEntry[]): void {
  const pages = doc.getPages();
  const valid = entries.filter((e) => e.pageIndex >= 0 && e.pageIndex < pages.length);
  if (!valid.length) return;
  const { context } = doc;
  const root = context.nextRef();
  const refs: PDFRef[] = valid.map(() => context.nextRef());
  valid.forEach((entry, i) => {
    context.assign(
      refs[i]!,
      context.obj({
        Title: PDFHexString.fromText(entry.title),
        Parent: root,
        ...(i > 0 ? { Prev: refs[i - 1]! } : {}),
        ...(i < refs.length - 1 ? { Next: refs[i + 1]! } : {}),
        Dest: [pages[entry.pageIndex]!.ref, 'Fit'],
      }),
    );
  });
  context.assign(
    root,
    context.obj({ Type: 'Outlines', First: refs[0]!, Last: refs.at(-1)!, Count: refs.length }),
  );
  doc.catalog.set(PDFName.of('Outlines'), root);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

export class PdfBuilder {
  private readonly sources = new Map<string, Promise<PDFDocument>>();
  /** The PDF being written, between `start` and `finish`. */
  private current: { doc: PDFDocument; fonts: Fonts } | null = null;

  /** Keys of the source PDFs the pages need that have not been supplied. */
  missing(pages: readonly BuildPage[]): string[] {
    const keys = pages.flatMap((p) => (p.source.kind === 'pdf' ? [p.source.key] : []));
    return [...new Set(keys)].filter((key) => !this.sources.has(key));
  }

  addSource(key: string, bytes: ArrayBuffer | Uint8Array): void {
    const loading = load(bytes);
    // Keep a rejection from surfacing as unhandled before a build awaits it.
    loading.catch(() => {});
    this.sources.delete(key);
    this.sources.set(key, loading);
    while (this.sources.size > SOURCE_CAPACITY) {
      const oldest = this.sources.keys().next().value!;
      this.sources.delete(oldest);
    }
  }

  private async source(key: string): Promise<PDFDocument> {
    const loading = this.sources.get(key);
    if (!loading) throw new Error(`Source ${key} was not supplied`);
    // Most recently used last, so the least recently used is evicted first.
    this.sources.delete(key);
    this.sources.set(key, loading);
    return loading;
  }

  /** Begins a new PDF, dropping one left unfinished. */
  async start(meta: PdfMeta): Promise<void> {
    this.current = null;
    const doc = await PDFDocument.create();
    const created = new Date(meta.createdAt);
    doc.setTitle(meta.title);
    doc.setCreator('QRA Parts Count Tool');
    doc.setProducer('QRA Parts Count Tool');
    doc.setCreationDate(created);
    doc.setModificationDate(created);
    this.current = { doc, fonts: await embedFonts(doc) };
  }

  async append(page: BuildPage): Promise<void> {
    if (!this.current) throw new Error('No PDF has been started');
    const { doc, fonts } = this.current;
    if (page.source.kind === 'pdf') {
      const source = await this.source(page.source.key);
      if (page.source.pageIndex >= source.getPageCount()) {
        throw new PdfSourceError('missingPage', `Page ${page.source.pageIndex + 1} not found`);
      }
      await addAnnotatedPdfPage(doc, source, page.source.pageIndex, fonts, page.overlay);
    } else {
      addCadPage(doc, page.source.list, fonts, page.source.mode, page.overlay);
    }
  }

  /** Adds the bookmarks and returns the finished PDF. */
  async finish(outline: readonly OutlineEntry[] = []): Promise<Uint8Array> {
    if (!this.current) throw new Error('No PDF has been started');
    const { doc } = this.current;
    this.current = null;
    addOutline(doc, outline);
    return doc.save({ useObjectStreams: true });
  }

  /** A whole PDF in one call; its sources must have been supplied. */
  async build(job: BuildJob): Promise<Uint8Array> {
    await this.start(job);
    for (const page of job.pages) await this.append(page);
    return this.finish(job.outline);
  }

  clear(): void {
    this.sources.clear();
    this.current = null;
  }
}
