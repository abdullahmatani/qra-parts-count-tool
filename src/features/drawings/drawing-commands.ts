/**
 * Drawing commands for the drawing list and the register (DRW-04): rename a
 * drawing and delete it. Each is one undo step.
 */
import { removeDrawing, updateDrawing } from '@/domain/actions/drawings';
import { drawingDisplayName } from '@/domain/drawings';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const t = i18n.t.bind(i18n);

/**
 * Renames a drawing: its drawing number, the name the lists, tabs and exports
 * show. A blank or unchanged name changes nothing.
 */
export function renameDrawingCommand(drawingId: string, name: string): boolean {
  const drawing = useProjectStore.getState().doc?.drawings[drawingId];
  const drawingNo = name.trim();
  if (!drawing || !drawingNo || drawingNo === drawing.drawingNo) return false;
  return useProjectStore
    .getState()
    .apply(t('drawings.history.rename', { name: drawingNo }), (draft) =>
      updateDrawing(draft, drawingId, { drawingNo }),
    );
}

/** Asks the user to confirm deleting a drawing (DeleteDrawingDialog). */
export function requestDeleteDrawing(drawingId: string): boolean {
  const { doc, readOnly } = useProjectStore.getState();
  if (!doc?.drawings[drawingId] || readOnly) return false;
  useUiStore.getState().setDrawingDeleteRequest(drawingId);
  return true;
}

/**
 * Deletes a drawing with its markers, count items and links, and closes its
 * tab. Its file leaves drawings/ once no drawing uses it (see drawing-files),
 * and Undo brings both back.
 */
export function deleteDrawingCommand(drawingId: string): boolean {
  const drawing = useProjectStore.getState().doc?.drawings[drawingId];
  if (!drawing) return false;
  const done = useProjectStore
    .getState()
    .apply(t('drawings.history.delete', { name: drawingDisplayName(drawing) }), (draft) =>
      removeDrawing(draft, drawingId),
    );
  if (done) useUiStore.getState().closeDrawing(drawingId);
  return done;
}
