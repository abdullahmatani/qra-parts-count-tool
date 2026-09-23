import { History, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MAX_SNAPSHOTS, listSnapshots, type SnapshotInfo } from '@/services/backups';
import { restoreSnapshot } from '@/services/restore';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

function SnapshotList({
  disabled,
  onRestore,
}: {
  disabled: boolean;
  onRestore: (snapshot: SnapshotInfo) => void;
}) {
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  useEffect(() => {
    const dir = getWorkingDirectory();
    if (dir) void listSnapshots(dir).then(setSnapshots);
  }, []);

  if (!snapshots) return <Loader2 className="mx-auto animate-spin" />;
  if (snapshots.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('backups.empty')}</p>;
  }
  return (
    <ul className="max-h-96 divide-y overflow-y-auto rounded-md border" data-testid="snapshot-list">
      {snapshots.map((snapshot) => (
        <li key={snapshot.fileName} className="flex items-center gap-3 px-3 py-2 text-sm">
          <History className="size-4 text-muted-foreground" />
          <span className="flex-1">{dateFormat.format(snapshot.savedAt)}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {t('backups.revision', { revision: snapshot.revision })}
          </span>
          <span className="w-16 text-end text-xs text-muted-foreground">
            {(snapshot.size / 1024).toFixed(0)} kB
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onRestore(snapshot)}
          >
            {t('backups.restore')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Lists autosave snapshots in .backup/ and restores one (PRJ-05). */
export function BackupsDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'backups');
  const openDialog = useUiStore((s) => s.openDialog);
  const readOnly = useProjectStore((s) => s.readOnly);
  const [confirm, setConfirm] = useState<SnapshotInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = async (snapshot: SnapshotInfo) => {
    setBusy(true);
    try {
      await restoreSnapshot(snapshot.fileName);
      toast.success(t('backups.restored', { time: dateFormat.format(snapshot.savedAt) }));
      openDialog(null);
    } catch (error) {
      toast.error(t('backups.restoreFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => openDialog(next ? 'backups' : null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('backups.title')}</DialogTitle>
            <DialogDescription>
              {t('backups.description', { count: MAX_SNAPSHOTS })}
            </DialogDescription>
          </DialogHeader>
          {open && <SnapshotList disabled={readOnly || busy} onRestore={setConfirm} />}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backups.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && t('backups.confirmBody', { time: dateFormat.format(confirm.savedAt) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confirm && void restore(confirm)}>
              {t('backups.restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
