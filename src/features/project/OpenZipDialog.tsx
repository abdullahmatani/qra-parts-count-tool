import { FileArchive, FolderOpen, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isFileSystemAccessSupported } from '@/lib/fs/support';
import { useUiStore } from '@/store/ui-store';
import { pickWorkingDirectory } from './project-actions';
import { openZipIntoFolder, openZipReadOnly } from './project-zip-actions';

/**
 * PRJ-08: opens a project sent as a .zip — unpacked into a folder where the
 * browser can write to folders, otherwise read-only in the tab.
 */
export function OpenZipDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'openZip');
  const openDialog = useUiStore((s) => s.openDialog);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writable = isFileSystemAccessSupported();

  const close = () => {
    openDialog(null);
    setFile(null);
    setError(null);
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && close()}>
      <DialogContent className="sm:max-w-md" data-testid="open-zip-dialog">
        <DialogHeader>
          <DialogTitle>{t('zip.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {writable ? t('zip.dialogDescription') : t('zip.dialogDescriptionReadOnly')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <FileArchive /> {t('zip.chooseZip')}
          </Button>
          <span className="truncate text-xs text-muted-foreground">{file?.name ?? ''}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            data-testid="zip-file-input"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
              event.target.value = '';
            }}
          />
        </div>
        {busy && file && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> {t('zip.reading', { file: file.name })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('zip.failed')}: {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          {writable ? (
            <Button
              disabled={!file || busy}
              onClick={() =>
                void run(async () => {
                  const dir = await pickWorkingDirectory();
                  if (!dir) throw new Error(t('project.new.folderRequired'));
                  if (!(await openZipIntoFolder(file!, dir))) throw new Error(t('zip.failed'));
                })
              }
            >
              <FolderOpen /> {t('zip.chooseFolder')}
            </Button>
          ) : (
            <Button disabled={!file || busy} onClick={() => void run(() => openZipReadOnly(file!))}>
              <FolderOpen /> {t('zip.openInBrowser')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
