import { CheckCircle2, FolderOutput, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { exportErrorMessage, runExport, type ExportResult } from './export-actions';

/** EXP-02, EXP-06: choose the outputs and write them to a new folder in exports/. */
export function ExportDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'export');
  const openDialog = useUiStore((s) => s.openDialog);
  const mapping = useProjectStore((s) => s.doc?.templateMapping ?? null);
  const [excel, setExcel] = useState(true);
  const [csv, setCsv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    openDialog(next ? 'export' : null);
    if (!next) {
      setResult(null);
      setError(null);
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runExport({ excel, csv }));
    } catch (e) {
      setError(exportErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('export.title')}</DialogTitle>
          <DialogDescription>{t('export.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="export-excel"
              checked={excel}
              onCheckedChange={(v) => setExcel(v === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="export-excel">{t('export.excel')}</Label>
              <p className="text-xs text-muted-foreground">
                {mapping
                  ? t('export.excelTemplate', {
                      template: mapping.templateFile,
                      mode: t(`export.layoutModes.${mapping.layoutMode}`),
                    })
                  : t('export.excelNoTemplate')}
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => openDialog('templateMapper')}
              >
                {t('export.mapTemplate')}
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="export-csv" checked={csv} onCheckedChange={(v) => setCsv(v === true)} />
            <div className="space-y-0.5">
              <Label htmlFor="export-csv">{t('export.csv')}</Label>
              <p className="text-xs text-muted-foreground">{t('export.csvHint')}</p>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t('export.failed')}: {error}
            </p>
          )}
          {result && (
            <div
              className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm"
              data-testid="export-result"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-4 text-emerald-600" />
                {t('export.done', { folder: result.folder })}
              </p>
              <ul className="ps-6 font-mono text-xs">
                {result.files.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
              {result.unmapped > 0 && (
                <p className="text-xs text-marker-warning">
                  {t('export.unmapped', { count: result.unmapped })}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t('common.close')}
          </Button>
          <Button onClick={() => void run()} disabled={busy || (!excel && !csv)}>
            {busy ? <Loader2 className="animate-spin" /> : <FolderOutput />}
            {busy ? t('export.running') : t('export.run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
