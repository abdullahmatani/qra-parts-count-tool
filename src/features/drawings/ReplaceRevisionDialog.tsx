import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { sameSheetSize } from '@/domain/actions/drawings';
import { drawingDisplayName, paperSizeName } from '@/domain/drawings';
import type { Drawing, Size2D } from '@/domain/schema/types';
import {
  applyRevision,
  discardCandidate,
  measureOption,
  readRevisionFile,
  type RevisionCandidate,
} from './replace-revision';

const sizeText = (size: Size2D) =>
  `${paperSizeName(size)} (${Math.round(size.width)} × ${Math.round(size.height)} pt)`;

/** DRW-07: replaces a drawing's file with its next revision, keeping its markers. */
export function ReplaceRevisionDialog({
  drawing,
  onClose,
}: {
  drawing: Drawing;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<RevisionCandidate | null>(null);
  const [index, setIndex] = useState(0);
  const [size, setSize] = useState<Size2D | null>(null);
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candidateRef = useRef<RevisionCandidate | null>(null);

  // Close any CAD file left open when the dialog goes away.
  useEffect(() => () => void discardCandidate(candidateRef.current), []);

  const choose = async (file: File) => {
    setError(null);
    setBusy(t('revision.reading', { file: file.name }));
    await discardCandidate(candidateRef.current);
    try {
      const next = await readRevisionFile(file, drawing);
      candidateRef.current = next;
      setCandidate(next);
      await select(next, next.defaultIndex);
    } catch (e) {
      setCandidate(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const select = async (next: RevisionCandidate, i: number) => {
    setIndex(i);
    const option = await measureOption(next, i);
    setSize(option.size);
    setRevision(option.revision && option.revision !== drawing.revision ? option.revision : '');
  };

  const option = candidate?.options[index];
  const sameFile =
    !!candidate &&
    candidate.hash === drawing.fileHash &&
    option?.page === drawing.page &&
    option?.layout === drawing.layout;
  const sizeChanged = size ? !sameSheetSize(size, drawing.size) : false;

  const replace = async () => {
    if (!candidate) return;
    setBusy(t('revision.replace'));
    try {
      await applyRevision(drawing.id, candidate, index, revision);
      toast.success(
        t('revision.done', { drawing: drawingDisplayName(drawing), revision: revision.trim() }),
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="replace-revision">
        <DialogHeader>
          <DialogTitle>{t('revision.title', { drawing: drawingDisplayName(drawing) })}</DialogTitle>
          <DialogDescription>{t('revision.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <FileUp /> {t('revision.choose')}
            </Button>
            <span className="truncate text-xs text-muted-foreground" data-testid="revision-file">
              {candidate?.file.name ?? ''}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.dwg,.dxf"
              className="hidden"
              aria-label={t('revision.file')}
              data-testid="revision-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void choose(file);
              }}
            />
          </div>
          {busy && (
            <p className="flex items-center gap-2 text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" /> {busy}
            </p>
          )}
          {candidate && candidate.options.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="revision-option" className="text-xs">
                {candidate.fileType === 'pdf' ? t('revision.page') : t('revision.layout')}
              </Label>
              <Select
                value={String(index)}
                onValueChange={(value) => void select(candidate, Number(value))}
              >
                <SelectTrigger id="revision-option" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {candidate.options.map((o, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {o.page ? `${t('revision.page')} ${o.page}` : o.layout}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {candidate && size && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-2 text-xs">
              <p>
                {t('revision.current', {
                  revision: drawing.revision || '—',
                  size: sizeText(drawing.size),
                })}
              </p>
              <p>{t('revision.next', { size: sizeText(size) })}</p>
              {sameFile ? (
                <p className="text-marker-warning">{t('revision.sameFile')}</p>
              ) : sizeChanged ? (
                <p className="flex gap-1.5 text-marker-warning" data-testid="revision-size-warning">
                  <AlertTriangle className="size-4 shrink-0" /> {t('revision.sizeChanged')}
                </p>
              ) : (
                <p className="flex gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" /> {t('revision.sameSize')}
                </p>
              )}
            </div>
          )}
          {candidate && (
            <div className="space-y-1">
              <Label htmlFor="revision-value" className="text-xs">
                {t('revision.revision')}
              </Label>
              <Input
                id="revision-value"
                className="w-32"
                value={revision}
                onChange={(event) => setRevision(event.target.value)}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {t('revision.failed')}: {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={!!busy}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void replace()}
            disabled={!candidate || !size || sameFile || !!busy || !revision.trim()}
          >
            {t('revision.replace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
