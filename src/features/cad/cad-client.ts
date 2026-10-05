/**
 * Main-thread client for the CAD reader workers. Each call is a request with
 * an id; a worker that crashes (for example a WebAssembly trap in the DWG
 * reader) or times out is terminated and recreated for the next file. Several
 * files can be open in one worker at a time (a bulk import holds every file
 * until the user has chosen its layouts), so the DWG reader is only recycled
 * to free its memory once no file is open in it.
 */
import type { DisplayList } from './display-list';
import { DWG_READER_NAME, createDwgWorker } from './workers/dwg-reader';
import type { CadFileType, CadRequest, CadResponse, OpenResult } from './workers/protocol';

export class DwgReaderUnavailableError extends Error {
  constructor() {
    super('This build does not include a native DWG reader. Import the DXF or a PDF plot instead.');
    this.name = 'DwgReaderUnavailableError';
  }
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type RequestBody =
  | { op: 'open'; bytes: ArrayBuffer; fileType: CadFileType }
  | { op: 'build'; docId: number; space: string }
  | { op: 'close'; docId: number };

class WorkerClient {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly create: () => Worker | null;
  private restarts = 0;
  /** Documents open in the current worker. */
  private readonly open = new Set<number>();

  constructor(create: () => Worker | null) {
    this.create = create;
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = this.create();
    if (!worker) throw new DwgReaderUnavailableError();
    worker.onmessage = (event: MessageEvent<CadResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.reset(new Error(event.message || 'The CAD reader stopped unexpectedly.'));
    };
    this.worker = worker;
    return worker;
  }

  call<T>(body: RequestBody, timeoutMs = 180_000): Promise<T> {
    const worker = this.ensure();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.reset(new Error('The CAD reader took too long and was stopped.'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      const message = { id, ...body } as CadRequest;
      if (body.op === 'open') worker.postMessage(message, [body.bytes]);
      else worker.postMessage(message);
    });
  }

  /** Counts worker restarts; a file opened before a restart is gone from the reader. */
  get generation(): number {
    return this.restarts;
  }

  /** Whether a file is still open in this reader (a restart closes every file). */
  isOpen(handle: CadHandle): boolean {
    return handle.generation === this.generation && this.open.has(handle.docId);
  }

  opened(docId: number): void {
    this.open.add(docId);
  }

  closed(docId: number): void {
    this.open.delete(docId);
  }

  /** No file is open and no request is waiting for an answer. */
  get idle(): boolean {
    return this.open.size === 0 && this.pending.size === 0;
  }

  reset(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.restarts += 1;
    this.open.clear();
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

const dxfClient = new WorkerClient(
  () =>
    new Worker(new URL('./workers/dxf.worker.ts', import.meta.url), {
      type: 'module',
      name: 'dxf-reader',
    }),
);
const dwgClient = new WorkerClient(createDwgWorker);

export interface CadHandle extends OpenResult {
  fileType: CadFileType;
  /** The reader instance the file was opened in (see WorkerClient.generation). */
  generation: number;
}

function clientFor(fileType: CadFileType): WorkerClient {
  return fileType === 'dwg' ? dwgClient : dxfClient;
}

/** Whether native DWG files can be read in this build. */
export function isDwgReaderAvailable(): boolean {
  return DWG_READER_NAME !== '';
}

const NOT_OPEN = 'The CAD document is no longer open';

/** Parses a CAD file in a worker. The buffer is transferred (detached). */
export async function openCadFile(bytes: ArrayBuffer, fileType: CadFileType): Promise<CadHandle> {
  const client = clientFor(fileType);
  const generation = client.generation;
  const result = await client.call<OpenResult>({ op: 'open', bytes, fileType });
  if (client.generation !== generation) throw new Error(NOT_OPEN);
  client.opened(result.docId);
  return { ...result, fileType, generation };
}

export async function buildSpace(handle: CadHandle, space: string): Promise<DisplayList> {
  const client = clientFor(handle.fileType);
  // A restarted reader numbers its files from 1 again: never ask it for another file's id.
  if (!client.isOpen(handle)) throw new Error(NOT_OPEN);
  return client.call<DisplayList>({ op: 'build', docId: handle.docId, space });
}

export async function closeCadFile(handle: CadHandle): Promise<void> {
  const client = clientFor(handle.fileType);
  if (!client.isOpen(handle)) return;
  client.closed(handle.docId);
  await client.call({ op: 'close', docId: handle.docId }, 10_000).catch(() => {});
  // Release the DWG reader's memory once the last open file is closed; other
  // files (the rest of a bulk import, a drawing being opened) still need it.
  if (handle.fileType === 'dwg' && client.idle) client.reset(new Error('closed'));
}
