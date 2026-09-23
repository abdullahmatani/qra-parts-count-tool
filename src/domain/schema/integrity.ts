import type { Project } from './types';

export interface IntegrityIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Ids of the entities involved. */
  ids: string[];
}

/**
 * Cross-reference checks that the structural schema cannot express: unique
 * ids, dangling references and consistency between related entities. The
 * project still opens when issues are found; they are reported to the user.
 */
export function checkIntegrity(project: Project): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const push = (
    severity: IntegrityIssue['severity'],
    code: string,
    message: string,
    ids: string[],
  ) => issues.push({ severity, code, message, ids });

  // Unique ids across all entity collections.
  const seen = new Map<string, string>();
  const collections: [string, { id: string }[]][] = [
    ['drawing', project.drawings],
    ['segment', project.segments],
    ['marker', project.markers],
    ['item', project.items],
    ['note', project.notes],
    ['link', project.links],
    ['equipment type', project.library.equipmentTypes],
    ['bin set', project.library.binSets],
    ['bin', project.library.binSets.flatMap((set) => set.bins)],
  ];
  for (const [kind, list] of collections) {
    for (const entity of list) {
      const previous = seen.get(entity.id);
      if (previous) {
        push('error', 'duplicateId', `Duplicate id ${entity.id} (${previous} and ${kind}).`, [
          entity.id,
        ]);
      } else {
        seen.set(entity.id, kind);
      }
    }
  }

  const drawingIds = new Set(project.drawings.map((d) => d.id));
  const segmentIds = new Set(project.segments.map((s) => s.id));
  const markerById = new Map(project.markers.map((m) => [m.id, m]));
  const typeIds = new Set(project.library.equipmentTypes.map((t) => t.id));
  const binSetIds = new Set(project.library.binSets.map((b) => b.id));

  // Segment labels must be unique (SEG-02), compared case-insensitively.
  const labels = new Map<string, string>();
  for (const segment of project.segments) {
    const key = segment.label.trim().toLowerCase();
    const other = labels.get(key);
    if (other) {
      push('error', 'duplicateSegmentLabel', `Segment label "${segment.label}" is used twice.`, [
        other,
        segment.id,
      ]);
    } else {
      labels.set(key, segment.id);
    }
    for (const drawingId of segment.drawingIds) {
      if (!drawingIds.has(drawingId)) {
        push('warning', 'danglingDrawing', `Segment ${segment.label} links to a missing drawing.`, [
          segment.id,
          drawingId,
        ]);
      }
    }
    for (const esdvId of segment.boundingEsdvIds) {
      const esdv = markerById.get(esdvId);
      if (!esdv?.esdv) {
        push(
          'warning',
          'danglingEsdv',
          `Segment ${segment.label} lists a bounding ESDV that does not exist.`,
          [segment.id, esdvId],
        );
      }
    }
  }

  for (const marker of project.markers) {
    if (!drawingIds.has(marker.drawingId)) {
      push('error', 'danglingDrawing', `Marker ${marker.id} is on a missing drawing.`, [
        marker.id,
        marker.drawingId,
      ]);
    }
    if (marker.segmentId && !segmentIds.has(marker.segmentId)) {
      push('warning', 'danglingSegment', `Marker ${marker.id} belongs to a missing segment.`, [
        marker.id,
        marker.segmentId,
      ]);
    }
    for (const side of [marker.esdv?.upstreamSegmentId, marker.esdv?.downstreamSegmentId]) {
      if (side && !segmentIds.has(side)) {
        push('warning', 'danglingSegment', `ESDV ${marker.id} refers to a missing segment.`, [
          marker.id,
          side,
        ]);
      }
    }
  }

  const itemMarkers = new Map<string, string>();
  const seqs = new Map<number, string>();
  for (const item of project.items) {
    const marker = markerById.get(item.markerId);
    if (!marker) {
      push('error', 'danglingMarker', `Item #${item.seq} has no marker.`, [item.id, item.markerId]);
    } else {
      if (marker.segmentId !== item.segmentId) {
        push(
          'warning',
          'segmentMismatch',
          `Item #${item.seq} and its marker are in different segments.`,
          [item.id, marker.id],
        );
      }
      if (marker.drawingId !== item.drawingId) {
        push(
          'warning',
          'drawingMismatch',
          `Item #${item.seq} and its marker are on different drawings.`,
          [item.id, marker.id],
        );
      }
    }
    const otherItem = itemMarkers.get(item.markerId);
    if (otherItem) {
      push('error', 'markerShared', `Two items share marker ${item.markerId}.`, [
        otherItem,
        item.id,
      ]);
    } else {
      itemMarkers.set(item.markerId, item.id);
    }
    const otherSeq = seqs.get(item.seq);
    if (otherSeq) {
      push('warning', 'duplicateSeq', `Item number #${item.seq} is used twice.`, [
        otherSeq,
        item.id,
      ]);
    } else {
      seqs.set(item.seq, item.id);
    }
    if (item.seq >= project.nextItemSeq) {
      push('warning', 'seqCounter', `Item number #${item.seq} is not below the next item number.`, [
        item.id,
      ]);
    }
    if (item.equipmentTypeId && !typeIds.has(item.equipmentTypeId)) {
      push('warning', 'danglingType', `Item #${item.seq} has an unknown equipment type.`, [
        item.id,
        item.equipmentTypeId,
      ]);
    }
  }

  for (const type of project.library.equipmentTypes) {
    const refs = [type.binSetId, type.actuationBinSetIds.manual, type.actuationBinSetIds.automated];
    for (const ref of refs) {
      if (ref && !binSetIds.has(ref)) {
        push('warning', 'danglingBinSet', `Equipment type ${type.name} uses a missing bin set.`, [
          type.id,
          ref,
        ]);
      }
    }
  }
  if (project.library.esdvEquipmentTypeId && !typeIds.has(project.library.esdvEquipmentTypeId)) {
    push('warning', 'danglingType', 'The ESDV equipment type does not exist.', [
      project.library.esdvEquipmentTypeId,
    ]);
  }

  for (const note of project.notes) {
    if (!segmentIds.has(note.segmentId)) {
      push('warning', 'danglingSegment', `Note ${note.id} belongs to a missing segment.`, [
        note.id,
        note.segmentId,
      ]);
    }
  }

  for (const link of project.links) {
    if (!drawingIds.has(link.sourceDrawingId)) {
      push('warning', 'danglingDrawing', `Link ${link.id} is on a missing drawing.`, [link.id]);
    }
    if (link.targetDrawingId && !drawingIds.has(link.targetDrawingId)) {
      push('warning', 'brokenLink', `Link ${link.id} points at a missing drawing (LNK-05).`, [
        link.id,
      ]);
    }
  }

  return issues;
}
