/**
 * Message handling shared by the CAD reader workers: open a file into the
 * neutral model (kept in the worker), list its spaces, and build display lists
 * on request. Heavy parsing and flattening stay off the UI thread (FDS 9.1).
 */
import { buildDisplayList, listSpaces } from '../display-list';
import type { CadDocument } from '../model';
import type { CadFileType, CadRequest, CadResponse } from './protocol';

export type CadParser = (bytes: ArrayBuffer, fileType: CadFileType) => Promise<CadDocument>;

interface WorkerScope {
  onmessage: ((event: MessageEvent<CadRequest>) => void) | null;
  postMessage(message: CadResponse): void;
}

export function serveCadWorker(scope: WorkerScope, parse: CadParser): void {
  const documents = new Map<number, CadDocument>();
  let nextDocId = 1;

  scope.onmessage = (event) => {
    const request = event.data;
    void (async () => {
      try {
        if (request.op === 'open') {
          const doc = await parse(request.bytes, request.fileType);
          const docId = nextDocId++;
          documents.set(docId, doc);
          scope.postMessage({
            id: request.id,
            ok: true,
            result: {
              docId,
              spaces: listSpaces(doc),
              source: doc.source,
              unsupported: doc.unsupported,
            },
          });
        } else if (request.op === 'build') {
          const doc = documents.get(request.docId);
          if (!doc) throw new Error('The CAD document is no longer open');
          scope.postMessage({
            id: request.id,
            ok: true,
            result: buildDisplayList(doc, request.space),
          });
        } else {
          documents.delete(request.docId);
          scope.postMessage({ id: request.id, ok: true, result: null });
        }
      } catch (error) {
        scope.postMessage({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };
}
