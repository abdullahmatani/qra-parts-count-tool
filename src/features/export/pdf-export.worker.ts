/// <reference lib="webworker" />
/**
 * Annotated PDF export worker (FDS section 8.2): pdf-lib parses and writes
 * PDFs here, off the UI thread. Each request carries an id; a page that needs
 * a source PDF the worker does not hold answers with its key instead.
 */
import { PdfBuilder } from './pdf-build';
import {
  PdfSourceError,
  type PdfWorkerRequest,
  type PdfWorkerResponse,
} from './pdf-export-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const builder = new PdfBuilder();

function reply(response: PdfWorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer);
}

scope.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.op === 'sources') {
      for (const { key, bytes } of request.sources) builder.addSource(key, bytes);
      reply({ id: request.id, ok: true, kind: 'done' });
    } else if (request.op === 'start') {
      await builder.start(request.meta);
      reply({ id: request.id, ok: true, kind: 'done' });
    } else if (request.op === 'append') {
      const missing = builder.missing([request.page]);
      if (missing.length) {
        reply({ id: request.id, ok: true, kind: 'missing', keys: missing });
        return;
      }
      await builder.append(request.page);
      reply({ id: request.id, ok: true, kind: 'done' });
    } else if (request.op === 'finish') {
      const bytes = await builder.finish(request.outline);
      reply({ id: request.id, ok: true, kind: 'pdf', bytes }, [bytes.buffer]);
    } else {
      builder.clear();
      reply({ id: request.id, ok: true, kind: 'done' });
    }
  } catch (error) {
    reply({
      id: request.id,
      ok: false,
      problem: error instanceof PdfSourceError ? error.problem : null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
