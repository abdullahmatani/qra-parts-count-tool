import { AlertTriangle, CheckCircle2, Download, FolderOutput, Loader2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
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
import { formatExportName } from '@/domain/export/file-names';
import { drawingName } from '@/domain/export/pdf-plan';
import { preExportCheck, type CheckResult } from '@/domain/export/pre-export-check';
import type { ProjectDoc } from '@/domain/model';
import { useCountEntries } from '@/features/count/useCount';
import { CommitInput } from '@/features/segments/fields';
import { showMarker } from '@/features/segments/segment-commands';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { downloadExportFolder } from '@/features/project/project-zip-actions';
import {
  exportErrorMessage,
  runExport,
  setFilenamePatternCommand,
  unmappedCountNames,
  type ExportResult,
} from './export-actions';

const NAMES_SHOWN = 5;

function OutputOption({
  id,
  checked,
  onChange,
  label,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {children}
      </div>
    </div>
  );
}

/** What the file name pattern gives for the first drawing. */
function exampleName(doc: ProjectDoc): string {
  const drawing = doc.drawingOrder.map((id) => doc.drawings[id]).find(Boolean);
  const segment = doc.segmentOrder.map((id) => doc.segments[id]).find(Boolean);
  const name = formatExportName(doc.settings.exportFilenamePattern, {
    project: doc.name,
    segment: segment?.label ?? '',
    drawingNo: drawing ? drawingName(drawing) : 'PEFS-1001',
    rev: drawing?.revision ?? 'A',
    sheet: drawing?.sheet ?? '',
    title: drawing?.title ?? '',
    page: drawing?.page ? String(drawing.page) : '',
  });
  return `${name}.pdf`;
}

/** EXP-01: what might make the outputs wrong, with a way to go and look. */
function PreExportCheck({
  issues,
  onShow,
}: {
  issues: CheckResult[];
  onShow: (c: CheckResult) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2" data-testid="pre-export-check" aria-labelledby="export-check">
      <h3 id="export-check" className="text-sm font-medium">
        {t('export.check.title')}
      </h3>
      {issues.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" />
          {t('export.check.passed')}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t('export.check.issues', { count: issues.length })}
          </p>
          <ul className="space-y-1.5">
            {issues.map((issue) => {
              const text = t(`export.check.kinds.${issue.kind}`, { count: issue.count });
              const more = issue.names.length - NAMES_SHOWN;
              const canShow =
                issue.markerIds.length > 0 ||
                issue.segmentIds.length > 0 ||
                (issue.drawingIds?.length ?? 0) > 0;
              return (
                <li
                  key={issue.kind}
                  className="flex items-start gap-2 rounded-md border px-2 py-1.5"
                  data-testid="check-issue"
                  data-kind={issue.kind}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-marker-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{text}</p>
                    {issue.names.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        {issue.names.slice(0, NAMES_SHOWN).join(', ')}
                        {more > 0 ? ` +${more}` : ''}
                      </p>
                    )}
                  </div>
                  {canShow && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      aria-label={`${t('export.check.show')}: ${text}`}
                      onClick={() => onShow(issue)}
                    >
                      {t('export.check.show')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** EXP-01..06: check the project, choose the outputs and write them to a new folder in exports/. */
export function ExportDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'export');
  const openDialog = useUiStore((s) => s.openDialog);
  const doc = useProjectStore((s) => s.doc);
  const entries = useCountEntries();
  const [excel, setExcel] = useState(true);
  const [csv, setCsv] = useState(false);
  const [drawingPdfs, setDrawingPdfs] = useState(true);
  const [segmentPdfs, setSegmentPdfs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mapping = doc?.templateMapping ?? null;
  const readOnly = useProjectStore((s) => s.readOnly);
  const inMemory = useWorkspaceStore((s) => s.inMemory);
  // A read-only tab next to an editing one writes nothing; a .zip opened in memory can export.
  const blocked = readOnly && !inMemory;

  const issues = useMemo(() => {
    if (!open || !doc) return [];
    const unmapped = excel ? unmappedCountNames(doc, entries) : null;
    return preExportCheck(doc, entries, unmapped ? { unmappedCounts: unmapped } : {}).filter(
      (c) => c.count > 0,
    );
  }, [open, doc, entries, excel]);

  const close = (next: boolean) => {
    if (busy && !next) return;
    openDialog(next ? 'export' : null);
    if (!next) {
      setResult(null);
      setError(null);
    }
  };

  const show = (issue: CheckResult) => {
    const ui = useUiStore.getState();
    const [first] = issue.markerIds;
    if (first) {
      showMarker(first);
      ui.setHighlighted(issue.markerIds);
    } else if (issue.segmentIds[0]) {
      ui.setActiveSegment(issue.segmentIds[0]);
    } else if (issue.drawingIds?.[0]) {
      ui.openDrawing(issue.drawingIds[0]);
    }
    close(false);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      setResult(
        await runExport({
          excel,
          csv,
          drawingPdfs,
          segmentPdfs,
          accepted: issues.map((c) => ({ kind: c.kind, count: c.count, names: c.names })),
          onProgress: setProgress,
        }),
      );
    } catch (e) {
      setError(exportErrorMessage(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const nothing = !excel && !csv && !drawingPdfs && !segmentPdfs;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('export.title')}</DialogTitle>
          <DialogDescription>{t('export.description')}</DialogDescription>
        </DialogHeader>
        <PreExportCheck issues={issues} onShow={show} />
        <section className="space-y-3" aria-labelledby="export-outputs">
          <h3 id="export-outputs" className="text-sm font-medium">
            {t('export.outputs')}
          </h3>
          <OutputOption
            id="export-excel"
            checked={excel}
            onChange={setExcel}
            label={t('export.excel')}
          >
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
          </OutputOption>
          <OutputOption id="export-csv" checked={csv} onChange={setCsv} label={t('export.csv')}>
            <p className="text-xs text-muted-foreground">{t('export.csvHint')}</p>
          </OutputOption>
          <OutputOption
            id="export-drawing-pdfs"
            checked={drawingPdfs}
            onChange={setDrawingPdfs}
            label={t('export.drawingPdfs')}
          >
            <p className="text-xs text-muted-foreground">{t('export.drawingPdfsHint')}</p>
            {drawingPdfs && doc && (
              <div className="space-y-1 pt-1">
                <Label htmlFor="export-pattern" className="text-xs">
                  {t('export.filenamePattern')}
                </Label>
                <CommitInput
                  id="export-pattern"
                  className="h-8 font-mono text-xs"
                  value={doc.settings.exportFilenamePattern}
                  validate={(v) => (v.trim() ? null : t('export.patternRequired'))}
                  onCommit={setFilenamePatternCommand}
                />
                <p className="text-xs text-muted-foreground">{t('export.filenamePatternHint')}</p>
                <p className="font-mono text-xs" data-testid="filename-example">
                  {t('export.filenameExample', { name: exampleName(doc) })}
                </p>
              </div>
            )}
          </OutputOption>
          <OutputOption
            id="export-segment-pdfs"
            checked={segmentPdfs}
            onChange={setSegmentPdfs}
            label={t('export.segmentPdfs')}
          >
            <p className="text-xs text-muted-foreground">{t('export.segmentPdfsHint')}</p>
          </OutputOption>
        </section>
        {blocked && (
          <p className="text-sm text-muted-foreground" role="note">
            {t('zip.readOnlyExport')}
          </p>
        )}
        {busy && progress && (
          <p className="text-sm text-muted-foreground" role="status" data-testid="export-progress">
            {t('export.progress', progress)}
          </p>
        )}
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
            <ul className="max-h-40 overflow-y-auto ps-6 font-mono text-xs">
              {result.files.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
            {result.unmapped > 0 && (
              <p className="text-xs text-marker-warning">
                {t('export.unmapped', { count: result.unmapped })}
              </p>
            )}
            {inMemory && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-marker-warning">{t('zip.exportsNotSaved')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void downloadExportFolder(result.folder)}
                >
                  <Download /> {t('zip.downloadExports')}
                </Button>
              </div>
            )}
            {result.failures.length > 0 && (
              <div className="text-xs text-destructive" data-testid="export-failures">
                <p>{t('export.failures', { count: result.failures.length })}</p>
                <ul className="ps-4">
                  {result.failures.map((f) => (
                    <li key={f.file}>
                      <span className="font-mono">{f.file}</span> — {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            {t('common.close')}
          </Button>
          <Button onClick={() => void run()} disabled={busy || nothing || blocked}>
            {busy ? <Loader2 className="animate-spin" /> : <FolderOutput />}
            {busy
              ? t('export.running')
              : issues.length
                ? t('export.check.exportAnyway')
                : t('export.run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
