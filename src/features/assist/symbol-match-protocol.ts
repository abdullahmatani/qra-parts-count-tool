/** Messages between the main thread and the symbol matching worker. */
import type { Example, ExampleMatch, InkImage, MatchOptions } from '@/domain/symbol-match';

export interface MatchRequest {
  id: number;
  image: InkImage;
  /** The example symbols to look for, in image pixels (or in images of their own). */
  examples: Example[];
  options: MatchOptions;
}

export type MatchResponse =
  | { id: number; progress: { done: number; total: number } }
  | { id: number; ok: true; matches: ExampleMatch[] }
  | { id: number; ok: false; error: string };

export interface MatchTask {
  promise: Promise<ExampleMatch[]>;
  /** Stops the search; the promise then never settles. */
  cancel(): void;
}

/** Searches in a worker of its own, so a new search can simply stop the last one. */
export function matchInWorker(
  image: InkImage,
  examples: Example[],
  options: MatchOptions,
  onProgress?: (done: number, total: number) => void,
): MatchTask {
  const worker = new Worker(new URL('./symbol-match.worker.ts', import.meta.url), {
    type: 'module',
    name: 'symbol-match',
  });
  const promise = new Promise<ExampleMatch[]>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<MatchResponse>) => {
      const data = event.data;
      if ('progress' in data) {
        onProgress?.(data.progress.done, data.progress.total);
        return;
      }
      worker.terminate();
      if (data.ok) resolve(data.matches);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new Error(event.message || 'Symbol matching stopped unexpectedly.'));
    };
  });
  const request: MatchRequest = { id: 1, image, examples, options };
  const buffers = [
    image.data.buffer,
    ...examples.flatMap((e) => (e.image ? [e.image.data.buffer] : [])),
  ];
  worker.postMessage(request, buffers);
  return { promise, cancel: () => worker.terminate() };
}
