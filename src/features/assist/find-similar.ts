/**
 * Find similar symbols (roadmap #59, #60): the user picks a counted marker,
 * the drawing is rendered and searched for symbols that look like the one it
 * rings, and each match is offered as a suggestion. Nothing is counted until
 * the user accepts a suggestion.
 */
import { itemForMarker } from '@/domain/actions/items';
import { inkFromRgba, type SymbolMatch } from '@/domain/symbol-match';
import type { CircleGeometry, Drawing } from '@/domain/schema/types';
import type { DrawingSource } from '@/features/viewer/drawing-source';
import type { PdfPageSource } from '@/features/viewer/pdf/pdf-source';
import { BASE_SCALE } from '@/features/viewer/view-transform';
import i18n from '@/i18n';
import { readFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { placeSuggestedMarkers } from '@/features/markup/marker-commands';
import { shownSuggestions, useAssistStore, type Suggestion } from './assist-store';
import { matchInWorker, type MatchTask } from './symbol-match-protocol';

const t = i18n.t.bind(i18n);

/** The example symbol is rendered this many pixels across. */
const TEMPLATE_PIXELS = 36;
/** Below this the example is too small to match reliably. */
const MIN_TEMPLATE_PIXELS = 12;
/** The sheet is rendered with at most this many pixels. */
const MAX_SHEET_PIXELS = 12_000_000;
/** Matches below this are dropped; the similarity setting filters the rest. */
const SEARCH_FLOOR = 0.55;

/** Pixels per drawing unit for a sheet and an example symbol of the given size. */
export function matchScale(sheet: { width: number; height: number }, symbolSize: number): number {
  const wanted = TEMPLATE_PIXELS / symbolSize;
  return Math.min(wanted, Math.sqrt(MAX_SHEET_PIXELS / (sheet.width * sheet.height)));
}

async function openSource(dir: FsDirHandle, drawing: Drawing): Promise<DrawingSource> {
  if (drawing.fileType === 'pdf') {
    const { pdfCache } = await import('@/features/viewer/load-source');
    return pdfCache.openPage(
      `${drawing.fileName}#${drawing.fileHash}`,
      async () => (await readFile(dir, `drawings/${drawing.fileName}`)).arrayBuffer(),
      drawing.page ?? 1,
    );
  }
  // CAD drawings are matched in monochrome, as plotted, with the layers the user hid left out.
  const [{ loadCadDisplayList }, { CadDrawingSource }] = await Promise.all([
    import('@/features/cad/cad-drawings'),
    import('@/features/cad/cad-source'),
  ]);
  const hidden = useUiStore.getState().hiddenLayers[drawing.id] ?? [];
  return new CadDrawingSource(await loadCadDisplayList(dir, drawing), 'monochrome', hidden);
}

/** The whole sheet as canvas pixels at `scale` pixels per drawing unit. */
async function renderSheet(source: DrawingSource, scale: number): Promise<ImageData> {
  const width = Math.max(1, Math.round(source.size.width * scale));
  const height = Math.max(1, Math.round(source.size.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const view = {
    x: source.size.width / 2,
    y: source.size.height / 2,
    zoom: scale / BASE_SCALE,
    rotation: 0 as const,
  };
  await source.render({ canvas, view, canvasSize: { width, height }, devicePixelRatio: 1 }).promise;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(t('assist.errors.render'));
  return ctx.getImageData(0, 0, width, height);
}

let current: MatchTask | null = null;
let run = 0;

/** Searches the example marker's drawing for symbols like the one it rings. */
export async function findSimilarSymbols(exampleId: string): Promise<void> {
  const doc = useProjectStore.getState().doc;
  const dir = getWorkingDirectory();
  const example = doc?.markers[exampleId];
  const drawing = example ? doc?.drawings[example.drawingId] : undefined;
  if (!doc || !dir || !example || !drawing || example.geometry.type !== 'circle') return;
  const { cx, cy, r } = example.geometry;
  const store = useAssistStore.getState();
  current?.cancel();
  const token = ++run;
  store.start(drawing.id, exampleId);

  let source: DrawingSource | null = null;
  try {
    source = await openSource(dir, drawing);
    const scale = matchScale(source.size, 2 * r);
    if (2 * r * scale < MIN_TEMPLATE_PIXELS) throw new Error(t('assist.errors.tooSmall'));
    const pixels = await renderSheet(source, scale);
    if (token !== run) return;
    const sheet = inkFromRgba(pixels.data, pixels.width, pixels.height);
    const box = {
      x: (cx - r) * scale,
      y: (cy - r) * scale,
      width: 2 * r * scale,
      height: 2 * r * scale,
    };
    // Symbols already ringed by a marker (the example too) are not suggested again.
    const occupied = ringsOn(drawing.id).map((ring) => ({
      x: (ring.cx - ring.r) * scale,
      y: (ring.cy - ring.r) * scale,
      width: 2 * ring.r * scale,
      height: 2 * ring.r * scale,
    }));
    current = matchInWorker(sheet, box, { minScore: SEARCH_FLOOR, occupied });
    const matches = await current.promise;
    if (token !== run) return;
    useAssistStore.getState().finish(toSuggestions(matches, scale, r));
  } catch (error) {
    if (token !== run) return;
    useAssistStore.getState().fail(error instanceof Error ? error.message : String(error));
  } finally {
    // The viewer may be showing this page: leave its parsed state alone.
    if (drawing.fileType === 'pdf') (source as PdfPageSource | null)?.dispose(false);
    else source?.dispose();
  }
}

function ringsOn(drawingId: string): CircleGeometry[] {
  const doc = useProjectStore.getState().doc;
  return Object.values(doc?.markers ?? {})
    .filter((m) => m.drawingId === drawingId)
    .flatMap((m) => (m.geometry.type === 'circle' ? [m.geometry] : []));
}

/** Matches as circles in drawing coordinates, the size of the example's. */
function toSuggestions(matches: readonly SymbolMatch[], scale: number, r: number): Suggestion[] {
  return matches.map((m, i) => ({
    // Suggestions live only in memory, for one review.
    id: `suggestion-${run}-${i}`,
    cx: (m.x + m.width / 2) / scale,
    cy: (m.y + m.height / 2) / scale,
    r,
    score: m.score,
  }));
}

/** Stops a search in progress and closes the review. */
export function closeSuggestions(): void {
  run += 1;
  current?.cancel();
  current = null;
  useAssistStore.getState().close();
}

/** Brings a suggestion into view. */
export function showSuggestion(drawingId: string, suggestion: Suggestion): void {
  const pad = suggestion.r * 6;
  useUiStore.getState().focusDrawing(drawingId, {
    minX: suggestion.cx - pad,
    minY: suggestion.cy - pad,
    maxX: suggestion.cx + pad,
    maxY: suggestion.cy + pad,
  });
}

/**
 * Accepts suggestions: each becomes a marker with a count item like the
 * example's (type, actuation and size), in the active segment, as one undo step.
 */
export function acceptSuggestions(ids: readonly string[]): number {
  const state = useAssistStore.getState();
  const doc = useProjectStore.getState().doc;
  if (!doc || !state.drawingId) return 0;
  const chosen = state.suggestions.filter((s) => ids.includes(s.id));
  const example = state.exampleId ? doc.markers[state.exampleId] : undefined;
  const item = example ? itemForMarker(doc, example.id) : undefined;
  const placed = placeSuggestedMarkers(
    state.drawingId,
    chosen.map((s) => ({ type: 'circle', cx: s.cx, cy: s.cy, r: s.r })),
    item
      ? {
          equipmentTypeId: item.equipmentTypeId,
          actuation: item.actuation,
          nominalSize: item.nominalSize,
          sizeUnit: item.sizeUnit,
        }
      : useUiStore.getState().itemDefaults,
  );
  if (placed.length > 0) state.remove(chosen.map((s) => s.id));
  return placed.length;
}

export function rejectSuggestions(ids: readonly string[]): void {
  useAssistStore.getState().remove(ids);
}

/** Accepts every suggestion shown at the chosen similarity. */
export function acceptShownSuggestions(): number {
  return acceptSuggestions(shownSuggestions(useAssistStore.getState()).map((s) => s.id));
}
