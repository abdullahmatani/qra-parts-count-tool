/// <reference lib="webworker" />
/**
 * Runs symbol matching (roadmap #59) off the main thread, so the drawing stays
 * responsive while a sheet is searched.
 */
import { matchExamples } from '@/domain/symbol-match';
import type { MatchRequest, MatchResponse } from './symbol-match-protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<MatchRequest>) => {
  const { id, image, examples, options } = event.data;
  let response: MatchResponse;
  try {
    const matches = matchExamples(image, examples, options, (done, total) => {
      const progress: MatchResponse = { id, progress: { done, total } };
      self.postMessage(progress);
    });
    response = { id, ok: true, matches };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
