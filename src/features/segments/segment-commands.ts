/**
 * Segment commands for the panels and dialogs (SEG-02..07). Each is one undo
 * step; typing in a field merges into one step per field.
 */
import {
  createSegment,
  deleteSegment,
  linkDrawing,
  mergeSegments,
  moveSegment,
  nextSegmentLabel,
  segmentBoundsOnDrawing,
  splitSegment,
  unlinkDrawing,
  updateSegment,
  type SegmentDeletion,
  type SegmentInput,
  type SegmentPatch,
} from '@/domain/actions/segments';
import { geometryBounds, type Box } from '@/domain/markup/geometry';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const t = i18n.t.bind(i18n);

/** Creates a segment and makes it the active one (SEG-02, SEG-06). */
export function createSegmentCommand(input: SegmentInput): string | null {
  let id: string | null = null;
  const done = useProjectStore
    .getState()
    .apply(t('segments.history.create', { label: input.label.trim() }), (draft) => {
      id = createSegment(draft, input);
    });
  if (!done || !id) return null;
  useUiStore.getState().setActiveSegment(id);
  return id;
}

export function updateSegmentCommand(segmentId: string, patch: SegmentPatch): boolean {
  const project = useProjectStore.getState();
  const label = project.doc?.segments[segmentId]?.label ?? '';
  const fields = Object.keys(patch).sort().join(',');
  return project.apply(
    t('segments.history.edit', { label }),
    (draft) => updateSegment(draft, segmentId, patch),
    { coalesceKey: `segment:${segmentId}:${fields}` },
  );
}

export function deleteSegmentCommand(segmentId: string, mode: SegmentDeletion): boolean {
  const project = useProjectStore.getState();
  const label = project.doc?.segments[segmentId]?.label ?? '';
  const done = project.apply(t('segments.history.delete', { label }), (draft) =>
    deleteSegment(draft, segmentId, mode),
  );
  if (done) {
    const ui = useUiStore.getState();
    if (ui.activeSegmentId === segmentId) {
      ui.setActiveSegment(mode.kind === 'moveTo' ? mode.segmentId : null);
    }
    const doc = useProjectStore.getState().doc;
    ui.setSelection(ui.selection.filter((id) => doc?.markers[id]));
  }
  return done;
}

/** SEG-07: moves a segment up (-1) or down (+1) in the list. */
export function moveSegmentCommand(segmentId: string, delta: number): boolean {
  const project = useProjectStore.getState();
  const doc = project.doc;
  const index = doc?.segmentOrder.indexOf(segmentId) ?? -1;
  if (!doc || index < 0) return false;
  const to = index + delta;
  if (to < 0 || to >= doc.segmentOrder.length) return false;
  const label = doc.segments[segmentId]?.label ?? '';
  return project.apply(t('segments.history.move', { label }), (draft) =>
    moveSegment(draft, segmentId, to),
  );
}

/** SEG-07: merges one segment into another, which becomes the active segment. */
export function mergeSegmentsCommand(sourceId: string, targetId: string): boolean {
  const project = useProjectStore.getState();
  const source = project.doc?.segments[sourceId]?.label ?? '';
  const target = project.doc?.segments[targetId]?.label ?? '';
  const done = project.apply(t('segments.history.merge', { source, target }), (draft) =>
    mergeSegments(draft, sourceId, targetId),
  );
  if (done) useUiStore.getState().setActiveSegment(targetId);
  return done;
}

/**
 * SEG-07: moves the given markers of a segment into a new segment with the
 * next free label, which becomes the active segment. Returns its id.
 */
export function splitSegmentCommand(
  segmentId: string,
  markerIds: readonly string[],
): string | null {
  const project = useProjectStore.getState();
  if (!project.doc?.segments[segmentId]) return null;
  const source = project.doc.segments[segmentId].label;
  const label = nextSegmentLabel(project.doc);
  let id: string | null = null;
  const done = project.apply(t('segments.history.split', { source, label }), (draft) => {
    id = splitSegment(draft, segmentId, markerIds, label);
  });
  if (!done || !id) return null;
  useUiStore.getState().setActiveSegment(id);
  return id;
}

export function linkDrawingCommand(segmentId: string, drawingId: string): boolean {
  const project = useProjectStore.getState();
  const label = project.doc?.segments[segmentId]?.label ?? '';
  return project.apply(t('segments.history.link', { label }), (draft) =>
    linkDrawing(draft, segmentId, drawingId),
  );
}

export function unlinkDrawingCommand(segmentId: string, drawingId: string): boolean {
  const project = useProjectStore.getState();
  const label = project.doc?.segments[segmentId]?.label ?? '';
  return project.apply(t('segments.history.unlink', { label }), (draft) =>
    unlinkDrawing(draft, segmentId, drawingId),
  );
}

/** Adds a margin of a tenth of the box (at least `min` units) on every side. */
function padded(box: Box, min: number): Box {
  const pad = Math.max(min, (box.maxX - box.minX) * 0.1, (box.maxY - box.minY) * 0.1);
  return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
}

/**
 * SEG-05: opens a linked drawing zoomed to the segment's markers on it, or the
 * whole sheet when it has none there yet.
 */
export function showSegmentOnDrawing(segmentId: string, drawingId: string): void {
  const doc = useProjectStore.getState().doc;
  if (!doc?.drawings[drawingId]) return;
  const box = segmentBoundsOnDrawing(doc, segmentId, drawingId);
  useUiStore.getState().focusDrawing(drawingId, box ? padded(box, 40) : null);
}

/** Opens a marker's drawing, zooms to it and selects it. */
export function showMarker(markerId: string): void {
  const marker = useProjectStore.getState().doc?.markers[markerId];
  if (!marker) return;
  const ui = useUiStore.getState();
  ui.focusDrawing(marker.drawingId, padded(geometryBounds(marker.geometry), 120));
  ui.setSelection([markerId]);
}
