/**
 * The two stages of a study. Segments and their extent are defined first:
 * highlighted pipework, dashed zones, ESDVs, end flanges and drawing links.
 * Once the segments are done the parts are counted, and the interface shows
 * only what counting needs; the segments' set-up stays as it is, locked.
 */
import type { ProjectDoc } from './model';
import type { Marker, ProjectStage } from './schema/types';

export const STAGES: readonly ProjectStage[] = ['segments', 'count'];

/** Tools ids, as in the toolbar. Kept as strings here so the domain does not import the UI. */
export type StageTool =
  'select' | 'circle' | 'dashed' | 'highlighter' | 'link' | 'esdv' | 'endFlange' | 'stamp';

const SEGMENT_TOOLS: readonly StageTool[] = [
  'select',
  'highlighter',
  'dashed',
  'esdv',
  'endFlange',
  'link',
];
const COUNT_TOOLS: readonly StageTool[] = ['select', 'circle', 'stamp'];

/**
 * The tools of a stage. Counting with pipe lengths (CNT-12) also draws line
 * runs, so the dashed tool stays for them.
 */
export function stageTools(stage: ProjectStage, pipeLengthCounting: boolean): StageTool[] {
  if (stage === 'segments') return [...SEGMENT_TOOLS];
  return pipeLengthCounting ? [...COUNT_TOOLS, 'dashed'] : [...COUNT_TOOLS];
}

/** The tool a stage starts with: the highlighter to define segments, the circle to count. */
export function stageStartTool(stage: ProjectStage): StageTool {
  return stage === 'segments' ? 'highlighter' : 'circle';
}

/**
 * A marker that sets out a segment rather than counting a part: an ESDV, an
 * end flange, a highlighter stroke or a dashed zone, and a line run unless it
 * carries a pipe length (CNT-12). These are locked while counting.
 */
export function isSegmentSetupMarker(
  marker: Pick<Marker, 'esdv' | 'endFlange' | 'geometry'>,
  pipeLengthCounting: boolean,
): boolean {
  if (marker.esdv || marker.endFlange) return true;
  switch (marker.geometry.type) {
    case 'circle':
      return false;
    case 'polyline':
      return !pipeLengthCounting;
    default:
      return true;
  }
}

/** Markers the user can pick and edit in a stage. */
export function isEditableInStage(
  marker: Pick<Marker, 'esdv' | 'endFlange' | 'geometry'>,
  stage: ProjectStage,
  pipeLengthCounting: boolean,
): boolean {
  return stage === 'segments' || !isSegmentSetupMarker(marker, pipeLengthCounting);
}

export type ReadinessKind = 'unassignedSetup' | 'segmentsWithoutExtent' | 'fewBoundaries';

export interface ReadinessIssue {
  kind: ReadinessKind;
  count: number;
  markerIds: string[];
  segmentIds: string[];
  /** Segment labels, for the list. */
  names: string[];
}

/**
 * What may be unfinished in the segments before counting starts. Only the
 * kinds with something to say are returned; the user can start counting anyway.
 */
export function segmentReadiness(
  doc: Pick<ProjectDoc, 'segments' | 'segmentOrder' | 'markers' | 'settings'>,
): ReadinessIssue[] {
  const segments = doc.segmentOrder.map((id) => doc.segments[id]).filter((s) => s !== undefined);
  const markers = Object.values(doc.markers);
  const pipe = doc.settings.pipeLengthCounting;
  const issues: ReadinessIssue[] = [];

  // Highlights, zones, runs and end flanges that belong to no segment; ESDVs with no segment on either side.
  const unassigned = markers.filter((m) => {
    if (!isSegmentSetupMarker(m, pipe)) return false;
    if (m.esdv) return m.esdv.upstreamSegmentId === null && m.esdv.downstreamSegmentId === null;
    return m.segmentId === null || !doc.segments[m.segmentId];
  });
  if (unassigned.length) {
    issues.push({
      kind: 'unassignedSetup',
      count: unassigned.length,
      markerIds: unassigned.map((m) => m.id),
      segmentIds: [],
      names: [],
    });
  }

  const marked = new Set<string>();
  const flanges = new Map<string, number>();
  for (const m of markers) {
    if (m.segmentId) marked.add(m.segmentId);
    if (m.esdv) {
      if (m.esdv.upstreamSegmentId) marked.add(m.esdv.upstreamSegmentId);
      if (m.esdv.downstreamSegmentId) marked.add(m.esdv.downstreamSegmentId);
    }
    if (m.endFlange && m.segmentId) flanges.set(m.segmentId, (flanges.get(m.segmentId) ?? 0) + 1);
  }
  const empty = segments.filter((s) => !marked.has(s.id) && s.drawingIds.length === 0);
  if (empty.length) {
    issues.push({
      kind: 'segmentsWithoutExtent',
      count: empty.length,
      markerIds: [],
      segmentIds: empty.map((s) => s.id),
      names: empty.map((s) => s.label),
    });
  }

  // A segment is closed by at least two ESDVs or end flanges.
  const open = segments.filter((s) => {
    const esdvs = s.boundingEsdvIds.filter((id) => doc.markers[id]?.esdv).length;
    return esdvs + (flanges.get(s.id) ?? 0) < 2;
  });
  if (open.length) {
    issues.push({
      kind: 'fewBoundaries',
      count: open.length,
      markerIds: [],
      segmentIds: open.map((s) => s.id),
      names: open.map((s) => s.label),
    });
  }
  return issues;
}
