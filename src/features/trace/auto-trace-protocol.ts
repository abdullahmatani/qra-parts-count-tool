/** Messages between the main thread and the auto trace worker. */
import type { BoundarySides, TraceBarrier } from '@/domain/markup/auto-trace';
import type { XY } from '@/domain/markup/geometry';

/** Trace a segment out from its own boundaries, or the line work from a point. */
export type TraceTask =
  | { kind: 'segment'; segmentId: string; sides: BoundarySides[]; minLength: number }
  | { kind: 'point'; point: XY; radius: number };

export interface TraceRequest {
  id: number;
  /** Which rendered sheet the trace runs on; the worker keeps the last one. */
  key: string;
  /** The rendered sheet, when the worker may not have `key` yet. */
  image: { data: Uint8ClampedArray; width: number; height: number } | null;
  barriers: TraceBarrier[];
  task: TraceTask;
  /** Stubs shorter than this (px) are left out of the paths. */
  spur: number;
}

/** A traced stretch of line work, in the sheet's pixels. */
export interface TracedRegion {
  paths: XY[][];
  /** Ids of the boundaries and links it ran into. */
  reached: string[];
  length: number;
}

export type TraceResponse =
  | { id: number; ok: true; regions: TracedRegion[]; undecided: TracedRegion[] }
  | { id: number; ok: false; error: string; needsImage?: boolean };

let worker: Worker | null = null;
let nextId = 1;
/** The sheet the worker holds, as far as this side knows. */
let workerKey: string | null = null;
const pending = new Map<number, (response: TraceResponse) => void>();

function start(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL('./auto-trace.worker.ts', import.meta.url), {
    type: 'module',
    name: 'auto-trace',
  });
  created.onmessage = (event: MessageEvent<TraceResponse>) => {
    const settle = pending.get(event.data.id);
    pending.delete(event.data.id);
    settle?.(event.data);
  };
  created.onerror = (event) => {
    event.preventDefault();
    stopWorker();
    for (const [id, settle] of pending) {
      settle({ id, ok: false, error: event.message || 'The trace stopped unexpectedly.' });
    }
    pending.clear();
  };
  worker = created;
  return created;
}

/** Stops the worker and forgets the sheet it held (when the project closes). */
export function stopWorker(): void {
  worker?.terminate();
  worker = null;
  workerKey = null;
}

/** Whether the worker already holds the sheet rendered for `key`. */
export function workerHas(key: string): boolean {
  return worker !== null && workerKey === key;
}

/** Runs a trace in the worker, which keeps the thinned sheet for the next one. */
export function traceInWorker(request: Omit<TraceRequest, 'id'>): Promise<TraceResponse> {
  const target = start();
  const id = nextId++;
  if (request.image) workerKey = request.key;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    target.postMessage({ ...request, id }, request.image ? [request.image.data.buffer] : []);
  });
}
