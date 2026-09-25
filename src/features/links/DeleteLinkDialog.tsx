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
import { deleteLinkCommand } from './link-commands';

/** Asks before deleting a drawing link that leads to another drawing (see requestDeleteLink). */
export function DeleteLinkDialog() {
  const { t } = useTranslation();
  const linkId = useUiStore((s) => s.linkDeleteRequest);
  const setRequest = useUiStore((s) => s.setLinkDeleteRequest);
  const link = useProjectStore((s) => (linkId ? s.doc?.links[linkId] : undefined));
  const target = useProjectStore((s) =>
    link?.targetDrawingId ? s.doc?.drawings[link.targetDrawingId] : undefined,
  );
  const close = () => setRequest(null);
  if (!link) return null;
  const drawing = target ? drawingDisplayName(target) : '';

  return (
    <AlertDialog open onOpenChange={(open) => !open && close()}>
      <AlertDialogContent data-testid="delete-link-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('links.deleteDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {link.label
              ? t('links.deleteDialog.descriptionLabel', { label: link.label, drawing })
              : t('links.deleteDialog.description', { drawing })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              deleteLinkCommand(link.id);
              close();
            }}
          >
            {t('links.deleteDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
