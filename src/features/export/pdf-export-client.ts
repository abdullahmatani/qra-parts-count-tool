/**
 * Main-thread side of the PDF export worker. A PDF is written a page at a
 * time; `append` supplies source PDFs on demand: the worker says which it
 * lacks, the client reads them and retries.
 */
import {
  PdfSourceError,
  type BuildPage,
  type OutlineEntry,
  type PdfMeta,
  type PdfWorkerRequest,
  type PdfWorkerResponse,
} from './pdf-export-protocol';

type Body =
  | { op: 'sources'; sources: { key: string; bytes: ArrayBuffer }[] }
  | { op: 'start'; meta: PdfMeta }
  | { op: 'append'; page: BuildPage }
  | { op: 'finish'; outline: OutlineEntry[] }
  | { op: 'clear' };

type Success = Extract<PdfWorkerResponse, { ok: true }>;

export class PdfExportClient {
  private readonly worker: Worker;
  private readonly pending = new Map<
    number,
    { resolve: (r: Success) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;

  constructor(
    worker: Worker = new Worker(new URL('./pdf-export.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pdf-export',
    }),
  ) {
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response);
      else if (response.problem)
        pending.reject(new PdfSourceError(response.problem, response.error));
      else pending.reject(new Error(response.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || 'The PDF export stopped unexpectedly.'));
    };
  }

  private call(body: Body): Promise<Success> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message = { id, ...body } as PdfWorkerRequest;
      const transfer = body.op === 'sources' ? body.sources.map((s) => s.bytes) : [];
      this.worker.postMessage(message, transfer);
    });
  }

  /** Begins a new PDF; pages are then appended one by one and the PDF finished. */
  async start(meta: PdfMeta): Promise<void> {
    await this.call({ op: 'start', meta });
  }

  /** Adds a page; `readSource` loads a source PDF's bytes by key when the worker needs them. */
  async append(page: BuildPage, readSource: (key: string) => Promise<ArrayBuffer>): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await this.call({ op: 'append', page });
      if (result.kind === 'done') return;
      if (result.kind !== 'missing') break;
      const sources = await Promise.all(
        result.keys.map(async (key) => ({ key, bytes: await readSource(key) })),
      );
      await this.call({ op: 'sources', sources });
    }
    throw new Error('The PDF export worker did not accept the source drawings.');
  }

  /** Writes the bookmarks and returns the PDF. */
  async finish(outline: OutlineEntry[] = []): Promise<Uint8Array> {
    const result = await this.call({ op: 'finish', outline });
    if (result.kind !== 'pdf') throw new Error('The PDF export worker returned no PDF.');
    return result.bytes;
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  dispose(): void {
    this.worker.terminate();
    this.fail(new Error('The PDF export was closed.'));
  }
}
