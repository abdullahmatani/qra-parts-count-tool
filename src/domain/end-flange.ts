/**
 * End flanges: where an isolatable segment ends at something that is not an
 * ESDV, such as a flanged tie-in to the closed drain or flare header. An end
 * flange is drawn as a bar across the pipe and belongs to the segment it ends
 * (its `segmentId`). Like an ESDV it is a segment boundary: highlighter strokes
 * stop at it and the auto trace does not run past it. It is not counted; a
 * flange to be counted is circled as equipment.
 */
import type { EndFlangeData, EndFlangeDestination, Marker, Size2D } from './schema/types';

export const END_FLANGE_DESTINATIONS: readonly EndFlangeDestination[] = [
  'closedDrain',
  'flare',
  'other',
];

export function newEndFlangeData(destination: EndFlangeDestination = 'closedDrain'): EndFlangeData {
  return { tag: '', destination };
}

/** Thickness of an end flange's bar: 6 pt on an A1 sheet (2384 pt), about 2 mm. */
const THICKNESS_FRACTION = 1 / 400;

/** The thickness of an end flange's bar on a sheet, in drawing units (its double line's gap). */
export function endFlangeThickness(sheet: Size2D): number {
  return Math.max(sheet.width, sheet.height) * THICKNESS_FRACTION;
}

/** The label beside an end flange with no tag. */
const DEFAULT_LABEL: Record<EndFlangeDestination, string> = {
  closedDrain: 'To closed drain',
  flare: 'To flare',
  other: 'End flange',
};

export function endFlangeLabel(data: EndFlangeData): string {
  return data.tag || DEFAULT_LABEL[data.destination];
}

/** A marker that bounds segments on its drawing: an ESDV (ring or double line) or an end flange. */
export function isBoundaryMarker(marker: Pick<Marker, 'esdv' | 'endFlange' | 'geometry'>): boolean {
  return (
    (marker.esdv !== null || marker.endFlange !== null) &&
    (marker.geometry.type === 'circle' || marker.geometry.type === 'doubleLine')
  );
}
