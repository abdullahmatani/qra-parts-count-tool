/**
 * Segment edits (SEG-02..05, SEG-07). Like the other actions, these mutate a
 * project document, usually an Immer draft inside `useProjectStore.apply`.
 */
import { newId } from '@/lib/ids';
import { geometryBounds, unionBoxes, type Box } from '../markup/geometry';
import { markerSegmentIds } from '../markup/presentation';
import type { ProjectDoc } from '../model';
import { nextSegmentColour } from '../palette';
import type { EsdvData, Segment } from '../schema/types';
import { assignMarkers, deleteMarkers, syncBoundingEsdvs } from './markers';

export { syncBoundingEsdvs };

export type SegmentInput = Pick<Segment, 'label'> &
  Partial<Omit<Segment, 'id' | 'label' | 'boundingEsdvIds'>>;

/** Case-insensitive label comparison, as the integrity check uses (SEG-02). */
export function isSegmentLabelTaken(
  doc: Pick<ProjectDoc, 'segments'>,
  label: string,
  exceptId?: string,
): boolean {
  const key = label.trim().toLowerCase();
  return Object.values(doc.segments).some(
    (s) => s.id !== exceptId && s.label.trim().toLowerCase() === key,
  );
}

/**
 * Suggests the next label: the highest numbered label plus one, keeping its
 * prefix and zero padding (IS-09 → IS-10), or IS-01 for the first segment.
 */
export function nextSegmentLabel(doc: Pick<ProjectDoc, 'segments'>): string {
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const segment of Object.values(doc.segments)) {
    const match = /^(.*?)(\d+)$/.exec(segment.label.trim());
    if (!match) continue;
    const n = Number(match[2]);
    if (!best || n > best.n) best = { prefix: match[1]!, n, width: match[2]!.length };
  }
  if (!best) return 'IS-01';
  let n = best.n + 1;
  let label = `${best.prefix}${String(n).padStart(best.width, '0')}`;
  while (isSegmentLabelTaken(doc, label)) {
    n += 1;
    label = `${best.prefix}${String(n).padStart(best.width, '0')}`;
  }
  return label;
}

/** Creates a segment at the end of the list (SEG-02) and returns its id. */
export function createSegment(doc: ProjectDoc, input: SegmentInput): string {
  const id = newId('seg');
  doc.segments[id] = {
    id,
    label: input.label.trim(),
    description: input.description ?? '',
    colour: input.colour ?? nextSegmentColour(Object.values(doc.segments).map((s) => s.colour)),
    fluid: input.fluid ?? '',
    phase: input.phase ?? '',
    pressure: input.pressure ?? null,
    temperature: input.temperature ?? null,
    equipment: input.equipment ?? '',
    streamNumber: input.streamNumber ?? '',
    h2sMoleFraction: input.h2sMoleFraction ?? null,
    molecularWeightOrDensity: input.molecularWeightOrDensity ?? null,
    status: input.status ?? 'notStarted',
    boundingEsdvIds: [],
    drawingIds: input.drawingIds ? [...input.drawingIds] : [],
    countedBy: input.countedBy ?? '',
    checkedBy: input.checkedBy ?? '',
  };
  doc.segmentOrder.push(id);
  return id;
}

export type SegmentPatch = Partial<Omit<Segment, 'id' | 'boundingEsdvIds' | 'drawingIds'>>;

/** Edits segment fields; unchanged values are left alone so undo patches stay small. */
export function updateSegment(doc: ProjectDoc, segmentId: string, patch: SegmentPatch): void {
  const segment = doc.segments[segmentId];
  if (!segment) return;
  for (const [key, value] of Object.entries(patch) as [keyof SegmentPatch, never][]) {
    if (value === undefined) continue;
    const next = key === 'label' ? (value as string).trim() : value;
    if (segment[key] !== next) (segment as Record<string, unknown>)[key] = next;
  }
}

/** SEG-04: links a drawing to a segment. */
export function linkDrawing(doc: ProjectDoc, segmentId: string, drawingId: string): void {
  const segment = doc.segments[segmentId];
  if (segment && doc.drawings[drawingId] && !segment.drawingIds.includes(drawingId)) {
    segment.drawingIds.push(drawingId);
  }
}

/** Unlinks a drawing; the segment's markers on it stay where they are. */
export function unlinkDrawing(doc: ProjectDoc, segmentId: string, drawingId: string): void {
  const segment = doc.segments[segmentId];
  if (segment?.drawingIds.includes(drawingId)) {
    segment.drawingIds = segment.drawingIds.filter((id) => id !== drawingId);
  }
}

/** Markers of a segment on a drawing: its own markers and the ESDVs on its boundary. */
export function segmentMarkerIds(
  doc: Pick<ProjectDoc, 'markers'>,
  segmentId: string,
  drawingId?: string,
): string[] {
  return Object.values(doc.markers)
    .filter(
      (m) =>
        (drawingId === undefined || m.drawingId === drawingId) &&
        markerSegmentIds(m).includes(segmentId),
    )
    .map((m) => m.id);
}

/** SEG-05: the area of a drawing covered by a segment's markers, or null. */
export function segmentBoundsOnDrawing(
  doc: Pick<ProjectDoc, 'markers'>,
  segmentId: string,
  drawingId: string,
): Box | null {
  return unionBoxes(
    segmentMarkerIds(doc, segmentId, drawingId).map((id) =>
      geometryBounds(doc.markers[id]!.geometry),
    ),
  );
}

export type SegmentDeletion = { kind: 'moveTo'; segmentId: string } | { kind: 'deleteMarkers' };

/**
 * Deletes a segment (FDS section 5: asks whether to move its markers to
 * another segment or delete them). Notes and ESDV sides follow the markers to
 * the other segment; when the markers are deleted, the notes go too and ESDVs
 * on the boundary are kept with that side cleared.
 */
export function deleteSegment(doc: ProjectDoc, segmentId: string, mode: SegmentDeletion): void {
  const segment = doc.segments[segmentId];
  if (!segment) return;
  const target = mode.kind === 'moveTo' ? doc.segments[mode.segmentId] : undefined;
  if (mode.kind === 'moveTo' && (!target || target.id === segmentId)) return;

  const own = Object.values(doc.markers).filter((m) => !m.esdv && m.segmentId === segmentId);
  if (target) {
    for (const marker of own) {
      marker.segmentId = target.id;
      if (!target.drawingIds.includes(marker.drawingId)) target.drawingIds.push(marker.drawingId);
    }
    for (const item of Object.values(doc.items)) {
      if (item.segmentId === segmentId) item.segmentId = target.id;
    }
    for (const note of Object.values(doc.notes)) {
      if (note.segmentId === segmentId) note.segmentId = target.id;
    }
  } else {
    deleteMarkers(
      doc,
      own.map((m) => m.id),
    );
    for (const item of Object.values(doc.items)) {
      if (item.segmentId === segmentId) item.segmentId = null;
    }
    for (const note of Object.values(doc.notes)) {
      if (note.segmentId === segmentId) delete doc.notes[note.id];
    }
  }

  for (const marker of Object.values(doc.markers)) {
    if (!marker.esdv) continue;
    if (marker.esdv.upstreamSegmentId === segmentId) {
      marker.esdv.upstreamSegmentId = target?.id ?? null;
    }
    if (marker.esdv.downstreamSegmentId === segmentId) {
      marker.esdv.downstreamSegmentId = target?.id ?? null;
    }
    // An ESDV whose two sides are now the same segment bounds nothing.
    if (
      marker.esdv.upstreamSegmentId !== null &&
      marker.esdv.upstreamSegmentId === marker.esdv.downstreamSegmentId
    ) {
      marker.esdv.downstreamSegmentId = null;
    }
  }
  delete doc.segments[segmentId];
  doc.segmentOrder = doc.segmentOrder.filter((id) => id !== segmentId);
  syncBoundingEsdvs(doc);
}

/**
 * SEG-07: merges one segment into another. Its markers, items, notes and
 * linked drawings move over; an ESDV between the two stops being a boundary.
 */
export function mergeSegments(doc: ProjectDoc, sourceId: string, targetId: string): void {
  const source = doc.segments[sourceId];
  const target = doc.segments[targetId];
  if (!source || !target || sourceId === targetId) return;
  for (const drawingId of source.drawingIds) {
    if (!target.drawingIds.includes(drawingId)) target.drawingIds.push(drawingId);
  }
  deleteSegment(doc, sourceId, { kind: 'moveTo', segmentId: targetId });
}

/**
 * SEG-07: moves some of a segment's markers (with their items) into a new
 * segment placed right after it, with the same process data. Notes stay.
 * Returns the new segment's id, or null when no marker of the segment was given.
 */
export function splitSegment(
  doc: ProjectDoc,
  segmentId: string,
  markerIds: Iterable<string>,
  label: string,
): string | null {
  const source = doc.segments[segmentId];
  if (!source) return null;
  const moving = [...markerIds].filter((id) => {
    const marker = doc.markers[id];
    return marker && !marker.esdv && marker.segmentId === segmentId;
  });
  if (moving.length === 0) return null;
  const id = createSegment(doc, {
    label,
    fluid: source.fluid,
    phase: source.phase,
    pressure: source.pressure,
    temperature: source.temperature,
    streamNumber: source.streamNumber,
    h2sMoleFraction: source.h2sMoleFraction,
    molecularWeightOrDensity: source.molecularWeightOrDensity,
    status: 'inProgress',
  });
  moveSegment(doc, id, doc.segmentOrder.indexOf(segmentId) + 1);
  assignMarkers(doc, moving, id);
  return id;
}

/** Moves a segment to a new position in the list (SEG-07). */
export function moveSegment(doc: ProjectDoc, segmentId: string, toIndex: number): void {
  const from = doc.segmentOrder.indexOf(segmentId);
  if (from < 0) return;
  const order = doc.segmentOrder.filter((id) => id !== segmentId);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, segmentId);
  doc.segmentOrder = order;
}

export type EsdvPatch = Partial<EsdvData>;

/**
 * Edits an ESDV's tag, size, sides or rule override (SEG-01, SEG-08) and keeps
 * the segments' bounding ESDV lists in step (SEG-03). An ESDV cannot have the
 * same segment on both sides.
 */
export function updateEsdv(doc: ProjectDoc, markerId: string, patch: EsdvPatch): void {
  const esdv = doc.markers[markerId]?.esdv;
  if (!esdv) return;
  for (const [key, value] of Object.entries(patch) as [keyof EsdvData, never][]) {
    if (value !== undefined && esdv[key] !== value) (esdv as Record<string, unknown>)[key] = value;
  }
  for (const side of ['upstreamSegmentId', 'downstreamSegmentId'] as const) {
    const id = esdv[side];
    if (id !== null && !doc.segments[id]) esdv[side] = null;
  }
  if (esdv.upstreamSegmentId !== null && esdv.upstreamSegmentId === esdv.downstreamSegmentId) {
    // The side just chosen wins; the other one is cleared.
    if (patch.downstreamSegmentId !== undefined) esdv.upstreamSegmentId = null;
    else esdv.downstreamSegmentId = null;
  }
  for (const side of [esdv.upstreamSegmentId, esdv.downstreamSegmentId]) {
    if (side) linkDrawing(doc, side, doc.markers[markerId]!.drawingId);
  }
  syncBoundingEsdvs(doc);
}
