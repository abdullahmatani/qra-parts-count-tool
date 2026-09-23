import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Segment } from '@/domain/schema/types';
import { useProjectStore } from '@/store/project-store';
import { useOrderedSegments } from '@/store/selectors';
import { deleteSegmentCommand } from './segment-commands';

/**
 * FDS section 5: deleting a segment asks whether to move its markers to
 * another segment or delete them.
 */
export function DeleteSegmentDialog({
  segment,
  onClose,
}: {
  segment: Segment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const others = useOrderedSegments().filter((s) => s.id !== segment.id);
  const markerCount = useProjectStore(
    (s) =>
      Object.values(s.doc?.markers ?? {}).filter((m) => !m.esdv && m.segmentId === segment.id)
        .length,
  );
  const noteCount = useProjectStore(
    (s) => Object.values(s.doc?.notes ?? {}).filter((n) => n.segmentId === segment.id).length,
  );
  const [mode, setMode] = useState<'move' | 'delete'>(others.length ? 'move' : 'delete');
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const canConfirm = mode === 'delete' || !!target;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('segments.delete.title', { label: segment.label })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('segments.delete.description', {
              markers: t('segments.delete.markers', { count: markerCount }),
              notes: t('segments.delete.notes', { count: noteCount }),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup value={mode} onValueChange={(value) => setMode(value as 'move' | 'delete')}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="move" id="delete-move" disabled={others.length === 0} />
            <Label htmlFor="delete-move">{t('segments.delete.move')}</Label>
          </div>
          {mode === 'move' && others.length > 0 && (
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="ms-6 w-56" aria-label={t('segments.delete.moveTarget')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {others.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <RadioGroupItem value="delete" id="delete-all" />
            <Label htmlFor="delete-all">{t('segments.delete.deleteAll')}</Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">{t('segments.delete.esdvsKept')}</p>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              deleteSegmentCommand(
                segment.id,
                mode === 'move' ? { kind: 'moveTo', segmentId: target } : { kind: 'deleteMarkers' },
              );
              onClose();
            }}
          >
            {t('segments.delete.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
