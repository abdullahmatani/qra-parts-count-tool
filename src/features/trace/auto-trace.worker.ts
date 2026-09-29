/// <reference lib="webworker" />
/**
 * Runs the auto trace off the main thread. The thinned sheet is kept for the
 * next trace on the same drawing, and the graph for the same boundaries, so a
 * trace after the first one comes back at once.
 */
import {
  TraceGraph,
  traceSegment,
  traceSheet,
  type TraceRegion,
  type TraceSheet,
} from '@/domain/markup/auto-trace';
import type { TraceRequest, TraceResponse, TracedRegion } from './auto-trace-protocol';

declare const self: DedicatedWorkerGlobalScope;

let sheet: { key: string; value: TraceSheet } | null = null;
let graph: { key: string; value: TraceGraph } | null = null;

function run(request: TraceRequest): TraceResponse {
  const { id, key, image, barriers, task, spur } = request;
  if (image) {
    sheet = { key, value: traceSheet(image.data, image.width, image.height) };
    graph = null;
  }
  if (!sheet || sheet.key !== key) return { id, ok: false, error: 'No sheet', needsImage: true };
  const graphKey = `${key}\n${JSON.stringify(barriers)}`;
  if (!graph || graph.key !== graphKey) {
    graph = { key: graphKey, value: new TraceGraph(sheet.value, barriers) };
  }
  const g = graph.value;
  const out = (region: TraceRegion): TracedRegion => ({
    paths: g.paths(region, spur),
    reached: region.reached,
    length: region.length,
  });
  if (task.kind === 'point') {
    const seeds = g.edgesNear(task.point, task.radius);
    return { id, ok: true, regions: seeds.length ? [out(g.trace(seeds))] : [], undecided: [] };
  }
  const result = traceSegment(g, task.segmentId, task.sides, task.minLength);
  return {
    id,
    ok: true,
    regions: result.regions.map(out),
    undecided: result.undecided.map(out),
  };
}

self.onmessage = (event: MessageEvent<TraceRequest>) => {
  let response: TraceResponse;
  try {
    response = run(event.data);
  } catch (error) {
    response = {
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  self.postMessage(response);
};
