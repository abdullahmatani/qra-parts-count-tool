/**
 * Pre-export check (EXP-01): what may make the outputs wrong or incomplete.
 * The user can export anyway; the export log records what was accepted.
 */
import { findDuplicateTags, type CountDoc, type CountEntry } from '../count/count';
import type { ProjectDoc } from '../model';
import { isUnassigned } from '../markup/presentation';

export type CheckKind =
  | 'unassignedMarkers'
  | 'incompleteItems'
  | 'emptySegments'
  | 'segmentsWithoutDrawings'
  | 'duplicateTags'
  | 'unmappedCounts';

export interface CheckResult {
  kind: CheckKind;
  count: number;
  /** Markers to show (highlight) for this check. */
  markerIds: string[];
  /** Segments concerned (empty or unlinked segments). */
  segmentIds: string[];
  /** Short names for the list: segment labels or tags. */
  names: string[];
}

export interface CheckExtras {
  /** Counts with no cell in the mapped template (section 7), as "IS-01: Valve …" lines. */
  unmappedCounts?: string[];
}

export function preExportCheck(
  doc: CountDoc & Pick<ProjectDoc, 'segmentOrder'>,
  entries: readonly CountEntry[],
  extras: CheckExtras = {},
): CheckResult[] {
  const results: CheckResult[] = [];
  const segments = doc.segmentOrder.map((id) => doc.segments[id]!).filter(Boolean);

  const unassigned = Object.values(doc.markers).filter(isUnassigned);
  results.push({
    kind: 'unassignedMarkers',
    count: unassigned.length,
    markerIds: unassigned.map((m) => m.id),
    segmentIds: [],
    names: [],
  });

  const incomplete = entries.filter((e) => e.issues.length > 0);
  const incompleteMarkers = [...new Set(incomplete.map((e) => e.markerId))];
  results.push({
    kind: 'incompleteItems',
    count: incompleteMarkers.length,
    markerIds: incompleteMarkers,
    segmentIds: [],
    names: [],
  });

  const counted = new Set(entries.filter((e) => e.segmentId).map((e) => e.segmentId!));
  const empty = segments.filter((s) => !counted.has(s.id));
  results.push({
    kind: 'emptySegments',
    count: empty.length,
    markerIds: [],
    segmentIds: empty.map((s) => s.id),
    names: empty.map((s) => s.label),
  });

  const unlinked = segments.filter((s) => s.drawingIds.length === 0);
  results.push({
    kind: 'segmentsWithoutDrawings',
    count: unlinked.length,
    markerIds: [],
    segmentIds: unlinked.map((s) => s.id),
    names: unlinked.map((s) => s.label),
  });

  const duplicates = findDuplicateTags(entries, doc).filter((d) => !d.accepted);
  results.push({
    kind: 'duplicateTags',
    count: duplicates.length,
    markerIds: duplicates.flatMap((d) => d.markerIds),
    segmentIds: [],
    names: duplicates.map((d) => d.tag),
  });

  if (extras.unmappedCounts) {
    results.push({
      kind: 'unmappedCounts',
      count: extras.unmappedCounts.length,
      markerIds: [],
      segmentIds: [],
      names: extras.unmappedCounts,
    });
  }
  return results;
}

/** True when every check passed. */
export function checkPassed(results: readonly CheckResult[]): boolean {
  return results.every((r) => r.count === 0);
}
