/**
 * Assisted counting (roadmap #59, #60): symbols on a drawing that look like
 * counted ones are offered as suggestions, each with the size of the line it
 * sits on, read from the drawing's line numbers (CNT-01). Two ways in:
 *
 * - Find similar symbols: the user picks a counted marker, and the drawing is
 *   searched for symbols like the one it rings.
 * - Identify equipment: the drawing is searched for every kind of symbol
 *   counted so far, on this drawing or (for kinds not counted here yet) on up
 *   to three others, so one counted example of each kind does for a whole set
 *   of drawings.
 *
 * Nothing is counted until the user accepts a suggestion. A suggestion whose
 * line size cannot be read is accepted with no size, pending for the user.
 */
import { toast } from 'sonner';
import { radiusForSymbol } from '@/domain/markup/geometry';
import type { CircleGeometry, Drawing } from '@/domain/schema/types';
import {
  countedExamples,
  kindOf,
  pickExamples,
  symbolRadius,
  type ExampleMarker,
} from '@/domain/symbol-examples';
import { cropInk, inkFromRgba, type Example, type InkImage } from '@/domain/symbol-match';
import { placeSuggestedMarkers, type SuggestedPlacement } from '@/features/markup/marker-commands';
import type { DrawingSource } from '@/features/viewer/drawing-source';
import { closeSheetSource, openSheetSource, renderSheet } from '@/features/viewer/sheet-render';
import i18n from '@/i18n';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import {
  readingSizes,
  shownSuggestions,
  useAssistStore,
  type AssistMode,
  type Suggestion,
  type SuggestionSize,
} from './assist-store';
import { readSymbolSizes } from './line-sizes';
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

function ringsOn(drawingId: string): CircleGeometry[] {
  const doc = useProjectStore.getState().doc;
  return Object.values(doc?.markers ?? {})
    .filter((m) => m.drawingId === drawingId)
    .flatMap((m) => (m.geometry.type === 'circle' ? [{ ...m.geometry, r: symbolRadius(m) }] : []));
}

const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** A sheet rendered for matching, as ink. */
async function renderInk(drawing: Drawing, scale: number): Promise<InkImage> {
  const dir = getWorkingDirectory();
  if (!dir) throw new Error(t('assist.errors.render'));
  let source: DrawingSource | null = null;
  try {
    source = await openSheetSource(dir, drawing);
    const pixels = await renderSheet(source, scale, t('assist.errors.render'));
    return inkFromRgba(pixels.data, pixels.width, pixels.height);
  } finally {
    closeSheetSource(drawing, source);
  }
}

/** The example's box on its sheet, in pixels. */
function boxOf(e: ExampleMarker, scale: number) {
  const { cx, cy } = e.marker.geometry;
  return {
    x: (cx - e.r) * scale,
    y: (cy - e.r) * scale,
    width: 2 * e.r * scale,
    height: 2 * e.r * scale,
  };
}

/**
 * The examples as templates for the worker: those on the drawing searched
 * are cut from its sheet there; those on other drawings are cut here, with
 * as much of their sheet around them again, so long lines can be told apart.
 */
async function templatesFor(
  drawing: Drawing,
  examples: readonly ExampleMarker[],
  scale: number,
): Promise<Example[]> {
  const doc = useProjectStore.getState().doc;
  const templates: Example[] = [];
  const others = new Map<string, ExampleMarker[]>();
  for (const e of examples) {
    if (e.marker.drawingId === drawing.id) {
      templates.push({ id: e.marker.id, group: kindOf(e.item), box: boxOf(e, scale) });
    } else {
      others.set(e.marker.drawingId, [...(others.get(e.marker.drawingId) ?? []), e]);
    }
  }
  for (const [id, list] of others) {
    const other = doc?.drawings[id];
    // A sheet too large to render at this scale is left out.
    if (!other || other.size.width * other.size.height * scale ** 2 > MAX_SHEET_PIXELS) continue;
    const sheet = await renderInk(other, scale);
    for (const e of list) {
      const box = boxOf(e, scale);
      const margin = box.width;
      const x = Math.max(0, Math.round(box.x - margin));
      const y = Math.max(0, Math.round(box.y - margin));
      const image = cropInk(sheet, x, y, box.width + 2 * margin, box.height + 2 * margin);
      templates.push({
        id: e.marker.id,
        group: kindOf(e.item),
        box: { ...box, x: box.x - x, y: box.y - y },
        image,
      });
    }
  }
  return templates;
}

/** Searches a drawing for symbols like the examples, then reads the line size of each. */
async function search(drawingId: string, mode: AssistMode, examples: ExampleMarker[]) {
  const doc = useProjectStore.getState().doc;
  const drawing = doc?.drawings[drawingId];
  if (!doc || !drawing || !getWorkingDirectory()) return;
  const store = useAssistStore.getState();
  current?.cancel();
  const token = ++run;
  store.start(drawing.id, mode);
  try {
    if (examples.length === 0) throw new Error(t('assist.errors.noExamples'));
    // Examples on this drawing set the scale; else those from elsewhere.
    const here = examples.filter((e) => e.marker.drawingId === drawingId);
    const scale = matchScale(
      drawing.size,
      2 * median((here.length ? here : examples).map((e) => e.r)),
    );
    const usable = examples.filter((e) => 2 * e.r * scale >= MIN_TEMPLATE_PIXELS);
    if (usable.length === 0) throw new Error(t('assist.errors.tooSmall'));
    const sheet = await renderInk(drawing, scale);
    if (token !== run) return;
    const templates = await templatesFor(drawing, usable, scale);
    if (token !== run) return;
    // Symbols already ringed by a marker (the example too) are not suggested again.
    const occupied = ringsOn(drawing.id).map((ring) => ({
      x: (ring.cx - ring.r) * scale,
      y: (ring.cy - ring.r) * scale,
      width: 2 * ring.r * scale,
      height: 2 * ring.r * scale,
    }));
    current = matchInWorker(
      sheet,
      templates,
      { minScore: SEARCH_FLOOR, occupied },
      (done, total) => {
        if (token === run && total > 1) useAssistStore.getState().setProgress(done, total);
      },
    );
    const matches = await current.promise;
    if (token !== run) return;
    const radius = new Map(usable.map((e) => [e.marker.id, e.r]));
    const suggestions: Suggestion[] = matches.map((m, i) => ({
      // Suggestions live only in memory, for one review.
      id: `suggestion-${run}-${i}`,
      cx: (m.x + m.width / 2) / scale,
      cy: (m.y + m.height / 2) / scale,
      r: radius.get(m.exampleId) ?? 0,
      score: m.score,
      exampleId: m.exampleId,
      size: { status: 'reading' },
    }));
    useAssistStore.getState().finish(suggestions);
    await readSizes(token);
  } catch (error) {
    if (token !== run) return;
    useAssistStore.getState().fail(error instanceof Error ? error.message : String(error));
  }
}

/** Reads the line size of every suggestion; one that cannot be read is left pending. */
async function readSizes(token: number): Promise<void> {
  const { suggestions, drawingId } = useAssistStore.getState();
  const doc = useProjectStore.getState().doc;
  if (!doc || !drawingId || suggestions.length === 0) return;
  const items = new Map(Object.values(doc.items).map((item) => [item.markerId, item]));
  const symbols = suggestions.map((s) => ({
    id: s.id,
    cx: s.cx,
    cy: s.cy,
    r: s.r,
    typeId: items.get(s.exampleId)?.equipmentTypeId ?? null,
  }));
  let sizes: Map<string, SuggestionSize>;
  try {
    const read = await readSymbolSizes(drawingId, symbols);
    sizes = new Map(suggestions.map((s) => [s.id, read.get(s.id) ?? { status: 'unsized' }]));
  } catch (error) {
    if (token !== run) return;
    sizes = new Map(suggestions.map((s) => [s.id, { status: 'none' }]));
    toast.error(
      t('assist.sizes.failed', { message: error instanceof Error ? error.message : error }),
    );
  }
  if (token === run) useAssistStore.getState().setSizes(sizes);
}

/** Searches the example marker's drawing for symbols like the one it rings. */
export async function findSimilarSymbols(exampleId: string): Promise<void> {
  const doc = useProjectStore.getState().doc;
  const example = countedExamples(doc ?? { markers: {}, items: {} }).find(
    (e) => e.marker.id === exampleId,
  );
  if (!example) return;
  await search(example.marker.drawingId, 'similar', [example]);
}

/**
 * Searches a drawing for every kind of equipment counted so far in the
 * project, from one or more examples of each.
 */
export async function identifyEquipment(drawingId: string): Promise<void> {
  const doc = useProjectStore.getState().doc;
  if (!doc) return;
  await search(drawingId, 'identify', pickExamples(doc, drawingId));
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

/** The size an accepted suggestion is counted at: its line's, or none (pending). */
export function acceptedSize(size: SuggestionSize) {
  return size.status === 'found' ? size.size : null;
}

/**
 * Accepts suggestions: each becomes a marker with a count item of its
 * example's type and actuation, at the size read from its line (or none,
 * pending for the user), in the active segment, as one undo step.
 */
export function acceptSuggestions(ids: readonly string[]): number {
  const state = useAssistStore.getState();
  const doc = useProjectStore.getState().doc;
  if (!doc || !state.drawingId) return 0;
  const chosen = state.suggestions.filter((s) => ids.includes(s.id));
  const items = new Map(Object.values(doc.items).map((item) => [item.markerId, item]));
  const placements = chosen.map((s): SuggestedPlacement => {
    const example = doc.markers[s.exampleId];
    const item = items.get(s.exampleId);
    // Matches take the example's shape. A free-form outline fits only its own
    // symbol (matches may be turned), so they are ringed instead.
    const exampleSymbol = example?.style.symbol ?? 'circle';
    const symbol = exampleSymbol === 'freeform' ? 'circle' : exampleSymbol;
    const size = acceptedSize(s.size);
    return {
      geometry: { type: 'circle', cx: s.cx, cy: s.cy, r: radiusForSymbol(s.r, 'circle', symbol) },
      symbol,
      defaults: item
        ? {
            equipmentTypeId: item.equipmentTypeId,
            actuation: item.actuation,
            nominalSize: size?.value ?? null,
            sizeUnit: size?.unit ?? item.sizeUnit,
          }
        : { ...useUiStore.getState().itemDefaults, nominalSize: size?.value ?? null },
    };
  });
  const placed = placeSuggestedMarkers(state.drawingId, placements);
  if (placed.length > 0) state.remove(chosen.map((s) => s.id));
  return placed.length;
}

export function rejectSuggestions(ids: readonly string[]): void {
  useAssistStore.getState().remove(ids);
}

/**
 * Accepts every suggestion shown at the chosen similarity, and says how many
 * took their size from a line number and how many are pending a size.
 */
export function acceptShownSuggestions(): number {
  const state = useAssistStore.getState();
  if (readingSizes(state.suggestions)) return 0;
  const shown = shownSuggestions(state);
  const sized = shown.filter((s) => s.size.status === 'found').length;
  const pending = shown.filter((s) => s.size.status === 'none' || s.size.status === 'conflict');
  const placed = acceptSuggestions(shown.map((s) => s.id));
  if (placed > 0 && (sized > 0 || pending.length > 0)) {
    toast.success(
      [
        t('assist.accepted', { count: placed }),
        t('assist.sizes.summary', { sized, pending: pending.length }),
      ].join(' '),
      { duration: 8000 },
    );
  }
  return placed;
}
