import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { drawingDisplayName } from '@/domain/drawings';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { deleteDrawingCommand } from './drawing-commands';

/** Asks before deleting a drawing, saying what goes with it (see requestDeleteDrawing). */
export function DeleteDrawingDialog() {
  const { t } = useTranslation();
  const drawingId = useUiStore((s) => s.drawingDeleteRequest);
  const setRequest = useUiStore((s) => s.setDrawingDeleteRequest);
  const drawing = useProjectStore((s) => (drawingId ? s.doc?.drawings[drawingId] : undefined));
  const markers = useProjectStore((s) => s.doc?.markers);
  const links = useProjectStore((s) => s.doc?.links);
  const { markerCount, linked } = useMemo(() => {
    if (!drawingId) return { markerCount: 0, linked: false };
    return {
      markerCount: Object.values(markers ?? {}).filter((m) => m.drawingId === drawingId).length,
      linked: Object.values(links ?? {}).some(
        (l) => l.sourceDrawingId === drawingId || l.targetDrawingId === drawingId,
      ),
    };
  }, [drawingId, markers, links]);
  const close = () => setRequest(null);
  if (!drawing) return null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && close()}>
      <AlertDialogContent data-testid="delete-drawing-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('drawings.deleteDialog.title', { name: drawingDisplayName(drawing) })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('drawings.deleteDialog.body')}
            {markerCount > 0 && ` ${t('drawings.deleteDialog.markers', { count: markerCount })}`}
            {linked && ` ${t('drawings.deleteDialog.links')}`}
            {` ${t('drawings.deleteDialog.undo')}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              deleteDrawingCommand(drawing.id);
              close();
            }}
          >
            {t('drawings.deleteDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
