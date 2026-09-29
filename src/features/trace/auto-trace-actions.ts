/**
 * Auto trace (SEG-06): highlights a segment's pipework with the highlighter,
 * out to its ESDVs and end flanges, and up to the drawing links of off-page
 * connectors, where the pipe carries on on another drawing.
 *
 * Two ways in: the Auto trace button traces the active segment from its own
 * ESDVs and end flanges on the drawing, and while auto trace is on, a click on
 * a pipe traces that pipe. The sheet is rendered once and traced in a worker
 * (see domain/markup/auto-trace.ts); the strokes land as one undo step, cut at
 * the boundaries as painted strokes are.
 */
import { toast } from 'sonner';
import { drawingDisplayName } from '@/domain/drawings';
import type { TraceBarrier } from '@/domain/markup/auto-trace';
import type { XY } from '@/domain/markup/geometry';
import { penWidth } from '@/domain/markup/highlighter';
import {
  hasTraceBoundaries,
  paintedShare,
  traceBoundaries,
} from '@/domain/markup/trace-boundaries';
import type { ProjectDoc } from '@/domain/model';
import type { Drawing, Point, Size2D, StrokeGeometry } from '@/domain/schema/types';
import { followLink } from '@/features/links/link-commands';
import { placeTracedStrokes } from '@/features/markup/marker-commands';
import type { DrawingSource } from '@/features/viewer/drawing-source';
import { closeSheetSource, openSheetSource, renderSheet } from '@/features/viewer/sheet-render';
import i18n from '@/i18n';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import {
  traceInWorker,
  workerHas,
  type TraceRequest,
  type TraceResponse,
  type TraceTask,
  type TracedRegion,
} from './auto-trace-protocol';

const t = i18n.t.bind(i18n);

/** The sheet is rendered with at most this many pixels: two per point on an A1 sheet. */
const MAX_SHEET_PIXELS = 16_000_000;
/** …and at most this many pixels per drawing unit on a small one. */
const MAX_SCALE = 4;
/** How near a line (CSS px) a click must be for the trace to start from it. */
const CLICK_REACH = 10;
/** Points per stroke at most (the project file allows 5000). */
const MAX_STROKE_POINTS = 4000;
/** A traced path this much painted already is not painted again. */
const PAINTED = 0.9;

/** Pixels per drawing unit the sheet is traced at. */
export function traceScale(size: Size2D): number {
  return Math.min(MAX_SCALE, Math.sqrt(MAX_SHEET_PIXELS / (size.width * size.height)));
}

/** What the rendered sheet depends on: the drawing, the layers shown and the scale. */
function sheetKey(drawing: Drawing, scale: number): string {
  const hidden = useUiStore.getState().hiddenLayers[drawing.id] ?? [];
  return [
    drawing.id,
    drawing.fileHash,
    drawing.page ?? '',
    drawing.layout ?? '',
    hidden.join('\u0000'),
    scale,
  ].join('|');
}

async function renderFor(drawing: Drawing, scale: number): Promise<TraceRequest['image']> {
  const dir = getWorkingDirectory();
  if (!dir) throw new Error(t('autoTrace.errors.render'));
  let source: DrawingSource | null = null;
  try {
    source = await openSheetSource(dir, drawing);
    const pixels = await renderSheet(source, scale, t('autoTrace.errors.render'));
    return { data: pixels.data, width: pixels.width, height: pixels.height };
  } finally {
    closeSheetSource(drawing, source);
  }
}

/** Runs a trace, rendering the sheet only when the worker does not hold it already. */
async function run(
  drawing: Drawing,
  scale: number,
  barriers: TraceBarrier[],
  task: TraceTask,
  spur: number,
): Promise<Extract<TraceResponse, { ok: true }>> {
  const key = sheetKey(drawing, scale);
  const request = { key, barriers, task, spur };
  const image = workerHas(key) ? null : await renderFor(drawing, scale);
  let response = await traceInWorker({ ...request, image });
  if (!response.ok && response.needsImage) {
    response = await traceInWorker({ ...request, image: await renderFor(drawing, scale) });
  }
  if (!response.ok) throw new Error(response.error);
  return response;
}

/** A segment's highlighter strokes on a drawing. */
function strokesOf(doc: ProjectDoc, drawingId: string, segmentId: string | null): StrokeGeometry[] {
  return Object.values(doc.markers).flatMap((m) =>
    m.drawingId === drawingId && m.segmentId === segmentId && m.geometry.type === 'stroke'
      ? [m.geometry]
      : [],
  );
}

const toDrawing = (paths: readonly XY[][], scale: number): Point[][] =>
  paths.map((path) => path.map((p): Point => [p.x / scale, p.y / scale]));

/** Highlighter strokes along traced paths, leaving out what is painted already. */
function strokesFor(
  paths: readonly Point[][],
  width: number,
  painted: readonly StrokeGeometry[],
): StrokeGeometry[] {
  const out: StrokeGeometry[] = [];
  for (const points of paths) {
    if (points.length < 2 || paintedShare(points, painted) >= PAINTED) continue;
    for (let i = 0; i < points.length - 1; i += MAX_STROKE_POINTS - 1) {
      out.push({ type: 'stroke', points: points.slice(i, i + MAX_STROKE_POINTS), width });
    }
  }
  return out;
}

const list = (parts: string[]) =>
  new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(parts);

/**
 * Tells the user what was highlighted, what it ran into, and on which
 * drawings the pipe carries on (with a button to open the first of them).
 */
function reportDone(
  doc: ProjectDoc,
  regions: readonly TracedRegion[],
  segmentLabel: string | null,
) {
  const reached = [...new Set(regions.flatMap((r) => r.reached))];
  const esdvs = reached.filter((id) => doc.markers[id]?.esdv).length;
  const flanges = reached.filter((id) => doc.markers[id]?.endFlange).length;
  const links = reached.flatMap((id) => (doc.links[id] ? [doc.links[id]] : []));
  const parts = [
    ...(esdvs ? [t('autoTrace.ends.esdv', { count: esdvs })] : []),
    ...(flanges ? [t('autoTrace.ends.endFlange', { count: flanges })] : []),
    ...(links.length ? [t('autoTrace.ends.link', { count: links.length })] : []),
  ];
  const ends = parts.length ? list(parts) : t('autoTrace.ends.none');
  const onward = links.flatMap((link) => {
    const target = link.targetDrawingId ? doc.drawings[link.targetDrawingId] : undefined;
    return target ? [{ link, name: drawingDisplayName(target) }] : [];
  });
  const names = [...new Set(onward.map((o) => o.name))];
  const message = [
    segmentLabel
      ? t('autoTrace.done', { segment: segmentLabel, ends })
      : t('autoTrace.doneUnassigned', { ends }),
    ...(names.length ? [t('autoTrace.continues', { drawings: list(names) })] : []),
  ].join(' ');
  const first = onward[0];
  toast.success(message, {
    duration: 6000,
    ...(first
      ? {
          action: {
            label: t('autoTrace.open', { drawing: first.name }),
            onClick: () => void followLink(first.link.id),
          },
        }
      : {}),
  });
}

/** Common checks: the drawing, a writable project and no trace running. */
function ready(drawingId: string): { doc: ProjectDoc; drawing: Drawing } | null {
  const { doc, readOnly } = useProjectStore.getState();
  const drawing = doc?.drawings[drawingId];
  if (!doc || !drawing || readOnly || useUiStore.getState().tracing) return null;
  return { doc, drawing };
}

function activeSegment(doc: ProjectDoc): { id: string; label: string } | null {
  const id = useUiStore.getState().activeSegmentId;
  const segment = id ? doc.segments[id] : undefined;
  return segment ? { id: segment.id, label: segment.label } : null;
}

function failed(error: unknown): void {
  toast.error(t('autoTrace.failed', { message: error instanceof Error ? error.message : error }));
}

/**
 * Traces the active segment from its own ESDVs and end flanges on a drawing
 * and highlights what is the segment's. Pipe it cannot tell is the segment's
 * or its neighbour's is shown dashed, to be clicked. Returns whether it ran.
 */
export async function autoTraceSegment(drawingId: string): Promise<boolean> {
  const state = ready(drawingId);
  if (!state) return false;
  const { doc, drawing } = state;
  const segment = activeSegment(doc);
  const ui = useUiStore.getState();
  if (!segment) {
    toast(t('autoTrace.clickPipe'));
    return false;
  }
  const scale = traceScale(drawing.size);
  const { barriers, sides } = traceBoundaries(doc, drawingId, scale);
  if (!sides.some((b) => b.sides.includes(segment.id))) {
    toast(t('autoTrace.noBoundaries', { segment: segment.label }), { duration: 6000 });
    return false;
  }
  const width = penWidth(ui.highlighterPen, drawing.size);
  ui.setTracing(true);
  ui.setTraceHints(null);
  try {
    const task: TraceTask = {
      kind: 'segment',
      segmentId: segment.id,
      sides,
      minLength: 3 * width * scale,
    };
    const result = await run(drawing, scale, barriers, task, (width / 2) * scale);
    const now = useProjectStore.getState().doc ?? doc;
    const paths = result.regions.flatMap((r) => toDrawing(r.paths, scale));
    const strokes = strokesFor(paths, width, strokesOf(now, drawingId, segment.id));
    const placed = strokes.length
      ? placeTracedStrokes(
          drawingId,
          strokes,
          segment.id,
          t('autoTrace.history', { segment: segment.label }),
        )
      : [];
    const undecided = result.undecided.flatMap((r) => toDrawing(r.paths, scale));
    if (undecided.length) useUiStore.getState().setTraceHints({ drawingId, paths: undecided });

    if (placed.length) reportDone(now, result.regions, segment.label);
    else if (result.regions.length) toast(t('autoTrace.already'));
    if (undecided.length) {
      toast(t('autoTrace.undecided', { segment: segment.label }), { duration: 8000 });
    } else if (!result.regions.length) {
      toast(t('autoTrace.nothing', { segment: segment.label }), { duration: 6000 });
    }
    return true;
  } catch (error) {
    failed(error);
    return false;
  } finally {
    useUiStore.getState().setTracing(false);
  }
}

/**
 * Traces the pipe clicked at `point` (drawing units) out to the boundaries and
 * links it runs into, and highlights it in the active segment. `unitsPerPixel`
 * sizes how near the line the click must be.
 */
export async function autoTraceAt(
  drawingId: string,
  point: XY,
  unitsPerPixel: number,
): Promise<boolean> {
  const state = ready(drawingId);
  if (!state) return false;
  const { doc, drawing } = state;
  const segment = activeSegment(doc);
  const ui = useUiStore.getState();
  const scale = traceScale(drawing.size);
  const { barriers } = traceBoundaries(doc, drawingId, scale);
  const width = penWidth(ui.highlighterPen, drawing.size);
  ui.setTracing(true);
  try {
    const task: TraceTask = {
      kind: 'point',
      point: { x: point.x * scale, y: point.y * scale },
      radius: Math.max(2, CLICK_REACH * unitsPerPixel * scale),
    };
    const result = await run(drawing, scale, barriers, task, (width / 2) * scale);
    if (!result.regions.length) {
      toast(t('autoTrace.noLine'));
      return true;
    }
    const now = useProjectStore.getState().doc ?? doc;
    const paths = result.regions.flatMap((r) => toDrawing(r.paths, scale));
    const strokes = strokesFor(paths, width, strokesOf(now, drawingId, segment?.id ?? null));
    if (!strokes.length) {
      toast(t('autoTrace.already'));
      return true;
    }
    const label = segment
      ? t('autoTrace.history', { segment: segment.label })
      : t('autoTrace.historyUnassigned');
    const placed = placeTracedStrokes(drawingId, strokes, segment?.id ?? null, label);
    if (!placed.length) return true;
    // Dashed hints the trace has now covered go.
    const hints = useUiStore.getState().traceHints;
    if (hints?.drawingId === drawingId) {
      const left = hints.paths.filter((path) => paintedShare(path, strokes) < 0.5);
      useUiStore.getState().setTraceHints(left.length ? { drawingId, paths: left } : null);
    }
    reportDone(now, result.regions, segment?.label ?? null);
    return true;
  } catch (error) {
    failed(error);
    return false;
  } finally {
    useUiStore.getState().setTracing(false);
  }
}

/**
 * Turns auto trace on or off. On, it takes the highlighter and traces the
 * active segment from its ESDVs and end flanges on the active drawing; then
 * each click on a pipe traces that pipe, until it is turned off or another
 * tool is chosen.
 */
export function toggleAutoTrace(on?: boolean): boolean {
  const ui = useUiStore.getState();
  const next = on ?? !(ui.tool === 'highlighter' && ui.autoTrace);
  if (!next) {
    ui.setAutoTrace(false);
    return true;
  }
  const { doc, readOnly } = useProjectStore.getState();
  const drawingId = ui.activeDrawingId;
  if (!doc || readOnly || !drawingId) return false;
  // The trace needs something to run out to.
  if (!hasTraceBoundaries(doc, drawingId)) {
    toast(t('autoTrace.needsBoundary'));
    return false;
  }
  if (ui.tool !== 'highlighter') ui.setTool('highlighter');
  ui.setAutoTrace(true);
  void autoTraceSegment(drawingId);
  return true;
}
