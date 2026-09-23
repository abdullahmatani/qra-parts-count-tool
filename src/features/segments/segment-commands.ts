/**
 * Segment commands for the panels and dialogs (SEG-02..07). Each is one undo
 * step; typing in a field merges into one step per field.
 */
import {
  createSegment,
  deleteSegment,
  linkDrawing,
  segmentBoundsOnDrawing,
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
