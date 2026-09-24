/** Messages between the main thread and the symbol matching worker. */
import type { InkImage, MatchOptions, SymbolMatch } from '@/domain/symbol-match';

export interface MatchRequest {
  id: number;
  image: InkImage;
  /** The example symbol in image pixels. */
  box: { x: number; y: number; width: number; height: number };
  options: MatchOptions;
}

export type MatchResponse =
  { id: number; ok: true; matches: SymbolMatch[] } | { id: number; ok: false; error: string };

export interface MatchTask {
  promise: Promise<SymbolMatch[]>;
  /** Stops the search; the promise then never settles. */
  cancel(): void;
}

/** Searches in a worker of its own, so a new search can simply stop the last one. */
export function matchInWorker(
  image: InkImage,
  box: MatchRequest['box'],
  options: MatchOptions,
): MatchTask {
  const worker = new Worker(new URL('./symbol-match.worker.ts', import.meta.url), {
    type: 'module',
    name: 'symbol-match',
  });
  const promise = new Promise<SymbolMatch[]>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<MatchResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.matches);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new Error(event.message || 'Symbol matching stopped unexpectedly.'));
    };
  });
  const request: MatchRequest = { id: 1, image, box, options };
  worker.postMessage(request, [image.data.buffer]);
  return { promise, cancel: () => worker.terminate() };
}
