/// <reference lib="webworker" />
/**
 * Runs symbol matching (roadmap #59) off the main thread, so the drawing stays
 * responsive while a sheet is searched.
 */
import { matchExample } from '@/domain/symbol-match';
import type { MatchRequest, MatchResponse } from './symbol-match-protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<MatchRequest>) => {
  const { id, image, box, options } = event.data;
  let response: MatchResponse;
  try {
    response = { id, ok: true, matches: matchExample(image, box, options) };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
