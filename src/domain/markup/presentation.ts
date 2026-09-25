/**
 * How markers are shown: colour (ANN-03), label (ANN-05), visibility filters
 * (ANN-06) and inline warnings (FDS section 6). Shared by the canvas and the
 * annotated PDF export.
 */
import { ESDV_COLOUR, UNASSIGNED_COLOUR, segmentAppearance } from '../palette';
import type { CountItem, Marker, MarkerSymbol, Segment } from '../schema/types';

export interface MarkerFilterState {
  /** Segment ids whose markers are hidden; `unassigned` hides markers with no segment. */
  hiddenSegments: readonly string[];
  /** Equipment type ids whose markers are hidden. */
  hiddenTypes: readonly string[];
  showUnassignedOnly: boolean;
}

export const UNASSIGNED_FILTER_KEY = 'unassigned';

export const NO_FILTERS: MarkerFilterState = {
  hiddenSegments: [],
  hiddenTypes: [],
  showUnassignedOnly: false,
};

export function filtersActive(filters: MarkerFilterState): boolean {
  return (
    filters.hiddenSegments.length > 0 ||
    filters.hiddenTypes.length > 0 ||
    filters.showUnassignedOnly
  );
}

/** Segments a marker belongs to: its own, or both sides of an ESDV (SEG-01). */
export function markerSegmentIds(marker: Marker): string[] {
  if (marker.esdv) {
    return [marker.esdv.upstreamSegmentId, marker.esdv.downstreamSegmentId].filter(
      (id): id is string => id !== null,
    );
  }
  return marker.segmentId ? [marker.segmentId] : [];
}

export function isUnassigned(marker: Marker): boolean {
  return markerSegmentIds(marker).length === 0;
}

/** ANN-06: whether a marker passes the visibility filters. */
export function isMarkerVisible(
  marker: Marker,
  item: CountItem | undefined,
  filters: MarkerFilterState,
): boolean {
  const segments = markerSegmentIds(marker);
  if (filters.showUnassignedOnly && segments.length > 0) return false;
  if (segments.length === 0) {
    if (filters.hiddenSegments.includes(UNASSIGNED_FILTER_KEY)) return false;
  } else if (segments.every((id) => filters.hiddenSegments.includes(id))) {
    return false;
  }
  if (item?.equipmentTypeId && filters.hiddenTypes.includes(item.equipmentTypeId)) return false;
  return true;
}

/** What a marker is, for its name in the interface (`markup.shapes.*`). */
export type MarkerKind = 'esdv' | MarkerSymbol | 'rect' | 'polyline' | 'stroke';

export function markerKind(marker: Pick<Marker, 'esdv' | 'geometry' | 'style'>): MarkerKind {
  if (marker.esdv) return 'esdv';
  return marker.geometry.type === 'circle' ? marker.style.symbol : marker.geometry.type;
}

/** ANN-05: the label beside a marker: the tag if there is one, otherwise the item number. */
export function markerLabel(marker: Marker, item: CountItem | undefined): string {
  if (marker.esdv) return marker.esdv.tag || 'ESDV';
  if (!item) return '';
  return item.tag || `#${item.seq}`;
}

export interface MarkerPaint {
  colour: string;
  /** Stroke dash pattern for circles once the palette has cycled (in screen px). */
  dash: readonly number[];
}

const SOLID: readonly number[] = [];

/** ANN-03: a marker takes its segment's colour; ESDVs are red, unassigned markers grey. */
export function markerPaint(
  marker: Marker,
  segments: Readonly<Record<string, Segment>>,
): MarkerPaint {
  if (marker.esdv) return { colour: ESDV_COLOUR, dash: SOLID };
  const segment = marker.segmentId ? segments[marker.segmentId] : undefined;
  if (!segment) return { colour: UNASSIGNED_COLOUR, dash: SOLID };
  const appearance = segmentAppearance(segment.colour);
  return { colour: appearance.hex, dash: appearance.dash };
}

/** Count items keyed by their marker id. */
export function itemsByMarker(items: Readonly<Record<string, CountItem>>): Map<string, CountItem> {
  const out = new Map<string, CountItem>();
  for (const item of Object.values(items)) out.set(item.markerId, item);
  return out;
}
