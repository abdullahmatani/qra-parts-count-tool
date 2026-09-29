/**
 * Find similar symbols (roadmap #59, #60): the user picks a counted marker,
 * the drawing is rendered and searched for symbols that look like the one it
 * rings, and each match is offered as a suggestion. Nothing is counted until
 * the user accepts a suggestion.
 */
import { itemForMarker } from '@/domain/actions/items';
import { inkFromRgba, type SymbolMatch } from '@/domain/symbol-match';
import { radiusForSymbol } from '@/domain/markup/geometry';
import type { CircleGeometry, Marker } from '@/domain/schema/types';
import type { DrawingSource } from '@/features/viewer/drawing-source';
import { closeSheetSource, openSheetSource, renderSheet } from '@/features/viewer/sheet-render';
import i18n from '@/i18n';
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

let current: MatchTask | null = null;
let run = 0;

/** Searches the example marker's drawing for symbols like the one it rings. */
export async function findSimilarSymbols(exampleId: string): Promise<void> {
  const doc = useProjectStore.getState().doc;
  const dir = getWorkingDirectory();
  const example = doc?.markers[exampleId];
  const drawing = example ? doc?.drawings[example.drawingId] : undefined;
  if (!doc || !dir || !example || !drawing || example.geometry.type !== 'circle') return;
  const { cx, cy } = example.geometry;
  const r = symbolRadius(example);
  const store = useAssistStore.getState();
  current?.cancel();
  const token = ++run;
  store.start(drawing.id, exampleId);

  let source: DrawingSource | null = null;
  try {
    source = await openSheetSource(dir, drawing);
    const scale = matchScale(source.size, 2 * r);
    if (2 * r * scale < MIN_TEMPLATE_PIXELS) throw new Error(t('assist.errors.tooSmall'));
    const pixels = await renderSheet(source, scale, t('assist.errors.render'));
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
    closeSheetSource(drawing, source);
  }
}

/**
 * The radius of the symbol a circle marker counts. A dot sits on the symbol
 * and is drawn smaller than it (DOT_SCALE), so its symbol is the ring around it.
 */
function symbolRadius(marker: Marker): number {
  if (marker.geometry.type !== 'circle') return 0;
  return radiusForSymbol(marker.geometry.r, marker.style.symbol, 'circle');
}

function ringsOn(drawingId: string): CircleGeometry[] {
  const doc = useProjectStore.getState().doc;
  return Object.values(doc?.markers ?? {})
    .filter((m) => m.drawingId === drawingId)
    .flatMap((m) => (m.geometry.type === 'circle' ? [{ ...m.geometry, r: symbolRadius(m) }] : []));
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
  // Matches take the example's shape. A free-form outline fits only its own
  // symbol (matches may be turned), so they are ringed instead.
  const exampleSymbol = example?.style.symbol ?? 'circle';
  const symbol = exampleSymbol === 'freeform' ? 'circle' : exampleSymbol;
  const placed = placeSuggestedMarkers(
    state.drawingId,
    chosen.map((s) => ({
      type: 'circle',
      cx: s.cx,
      cy: s.cy,
      r: radiusForSymbol(s.r, 'circle', symbol),
    })),
    item
      ? {
          equipmentTypeId: item.equipmentTypeId,
          actuation: item.actuation,
          nominalSize: item.nominalSize,
          sizeUnit: item.sizeUnit,
        }
      : useUiStore.getState().itemDefaults,
    symbol,
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
