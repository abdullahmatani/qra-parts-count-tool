/**
 * Builds one annotated PDF from a list of pages (EXP-03, EXP-04). Runs in the
 * PDF export worker; also usable directly (tests). Source PDFs are parsed once
 * and kept while successive outputs use them, since a multi-page PDF often
 * holds many drawings and segment PDFs revisit the same files.
 */
import { PDFDocument } from 'pdf-lib';
import { addAnnotatedPdfPage, addCadPage, embedFonts } from './pdf-annotate';
import { PdfSourceError, type BuildJob } from './pdf-export-protocol';

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

export class PdfBuilder {
  private readonly sources = new Map<string, Promise<PDFDocument>>();

  /** Keys of the source PDFs the job needs that have not been supplied. */
  missing(job: BuildJob): string[] {
    const keys = job.pages.flatMap((p) => (p.source.kind === 'pdf' ? [p.source.key] : []));
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

  async build(job: BuildJob): Promise<Uint8Array> {
    const out = await PDFDocument.create();
    const created = new Date(job.createdAt);
    out.setTitle(job.title);
    out.setCreator('QRA Parts Count Tool');
    out.setProducer('QRA Parts Count Tool');
    out.setCreationDate(created);
    out.setModificationDate(created);
    const fonts = await embedFonts(out);
    for (const page of job.pages) {
      if (page.source.kind === 'pdf') {
        const source = await this.source(page.source.key);
        if (page.source.pageIndex >= source.getPageCount()) {
          throw new PdfSourceError('missingPage', `Page ${page.source.pageIndex + 1} not found`);
        }
        await addAnnotatedPdfPage(out, source, page.source.pageIndex, fonts, page.overlay);
      } else {
        addCadPage(out, page.source.list, fonts, page.source.mode, page.overlay);
      }
    }
    return out.save({ useObjectStreams: true });
  }

  clear(): void {
    this.sources.clear();
  }
}
