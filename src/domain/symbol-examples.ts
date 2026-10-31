/**
 * The counted symbols that assisted counting searches with (roadmap #59): each
 * counted equipment circle with a type is an example of its kind (type and
 * actuation). Identify equipment takes the kinds counted on the drawing it
 * searches, and kinds counted only elsewhere from as few other drawings as
 * have them, so one counted example of each kind serves a whole drawing set.
 */
import { radiusForSymbol } from './markup/geometry';
import type { ProjectDoc } from './model';
import type { CircleGeometry, CountItem, Marker } from './schema/types';

/** Examples of kinds not counted on the drawing come from at most this many other drawings. */
const MAX_OTHER_DRAWINGS = 3;
/** At most this many examples of one kind, and in all. */
const MAX_PER_KIND = 6;
const MAX_EXAMPLES = 40;

/** The radius of the symbol a circle marker rings (a dot sits inside its symbol). */
export function symbolRadius(marker: Pick<Marker, 'geometry' | 'style'>): number {
  if (marker.geometry.type !== 'circle') return 0;
  return radiusForSymbol(marker.geometry.r, marker.style.symbol, 'circle');
}

/** A counted equipment circle used as an example. */
export interface ExampleMarker {
  marker: Marker & { geometry: CircleGeometry };
  item: CountItem;
  /** The radius of the symbol it rings. */
  r: number;
}

/** What an example counts as: its type and actuation. */
export const kindOf = (item: CountItem) => `${item.equipmentTypeId}|${item.actuation ?? ''}`;

/** Whether an item's marker is a counted equipment circle with a type, an example. */
function isExample(item: CountItem, marker: Marker | undefined): marker is ExampleMarker['marker'] {
  return (
    item.equipmentTypeId !== null &&
    !!marker &&
    !marker.esdv &&
    !marker.endFlange &&
    marker.geometry.type === 'circle'
  );
}

/** Whether anything is counted to search with, on any drawing. */
export function hasExamples(doc: Pick<ProjectDoc, 'markers' | 'items'>): boolean {
  for (const item of Object.values(doc.items)) {
    if (isExample(item, doc.markers[item.markerId])) return true;
  }
  return false;
}

/** Counted equipment circles with a type: the examples there are to search with. */
export function countedExamples(doc: Pick<ProjectDoc, 'markers' | 'items'>): ExampleMarker[] {
  const out: ExampleMarker[] = [];
  for (const item of Object.values(doc.items)) {
    const marker = doc.markers[item.markerId];
    if (isExample(item, marker)) out.push({ marker, item, r: symbolRadius(marker) });
  }
  return out;
}

/**
 * The examples to identify a drawing's equipment with: every kind counted on
 * the drawing itself, and kinds counted only elsewhere from the fewest other
 * drawings that have them (those of the same file type first).
 */
export function pickExamples(
  doc: Pick<ProjectDoc, 'markers' | 'items' | 'drawings'>,
  drawingId: string,
): ExampleMarker[] {
  const all = countedExamples(doc);
  const chosen: ExampleMarker[] = [];
  const perKind = new Map<string, number>();
  const take = (e: ExampleMarker) => {
    const n = perKind.get(kindOf(e.item)) ?? 0;
    if (n >= MAX_PER_KIND) return;
    perKind.set(kindOf(e.item), n + 1);
    chosen.push(e);
  };
  all.filter((e) => e.marker.drawingId === drawingId).forEach(take);

  const fileType = doc.drawings[drawingId]?.fileType;
  const missing = (e: ExampleMarker) => !perKind.has(kindOf(e.item));
  for (let i = 0; i < MAX_OTHER_DRAWINGS; i += 1) {
    const kinds = new Map<string, Set<string>>();
    for (const e of all) {
      if (e.marker.drawingId === drawingId || !missing(e)) continue;
      const set = kinds.get(e.marker.drawingId) ?? new Set();
      set.add(kindOf(e.item));
      kinds.set(e.marker.drawingId, set);
    }
    const best = [...kinds.entries()].sort(
      ([a, ka], [b, kb]) =>
        kb.size - ka.size ||
        Number(doc.drawings[b]?.fileType === fileType) -
          Number(doc.drawings[a]?.fileType === fileType),
    )[0];
    if (!best) break;
    const [other] = best;
    const fresh = all.filter((e) => e.marker.drawingId === other && missing(e));
    for (const e of fresh) take(e);
  }
  // One of each kind first, so a long list cuts the extra examples, not kinds.
  const firsts = chosen.filter(
    (e, i) => chosen.findIndex((f) => kindOf(f.item) === kindOf(e.item)) === i,
  );
  const rest = chosen.filter((e) => !firsts.includes(e));
  return [...firsts, ...rest].slice(0, MAX_EXAMPLES);
}
