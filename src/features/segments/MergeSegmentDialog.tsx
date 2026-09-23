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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Segment } from '@/domain/schema/types';
import { useOrderedSegments } from '@/store/selectors';
import { mergeSegmentsCommand } from './segment-commands';

/** SEG-07: merges a segment into another one the user picks. */
export function MergeSegmentDialog({
  segment,
  onClose,
}: {
  segment: Segment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const others = useOrderedSegments().filter((s) => s.id !== segment.id);
  const [target, setTarget] = useState(others[0]?.id ?? '');

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('segments.merge.title', { label: segment.label })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('segments.merge.description', { label: segment.label })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-3">
          <Label htmlFor="merge-target">{t('segments.merge.target')}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="merge-target" className="w-56">
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
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!target}
            onClick={() => {
              mergeSegmentsCommand(segment.id, target);
              onClose();
            }}
          >
            {t('segments.merge.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
