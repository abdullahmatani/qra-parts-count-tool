import { toast } from 'sonner';
import i18n from '@/i18n';
import { useUiStore } from '@/store/ui-store';
import { IMPORTABLE_EXTENSIONS, importDrawingFiles, type ImportDeps } from './import-drawings';
import { inspectPdf } from './pdf-inspect';
import { useSpacePicker } from './space-picker-store';

/** Production dependencies: PDF.js inspection, the CAD workers and the space picker. */
async function importDeps(): Promise<ImportDeps> {
  const [client, cache] = await Promise.all([
    import('@/features/cad/cad-client'),
    import('@/features/cad/cad-cache'),
  ]);
  return {
    inspect: inspectPdf,
    now: () => new Date(),
    chooseSpaces: (candidates) => useSpacePicker.getState().ask(candidates),
    cad: {
      available: client.isDwgReaderAvailable,
      open: client.openCadFile,
      build: client.buildSpace,
      close: client.closeCadFile,
      writeCache: cache.writeCachedDisplayList,
    },
  };
}

const t = i18n.t.bind(i18n);

/** Imports files with progress and a summary toast; opens the first new drawing. */
export async function importWithFeedback(files: readonly File[]): Promise<void> {
  if (files.length === 0) return;
  const toastId = toast.loading(t('import.progress', { done: 0, total: files.length, name: '' }));
  try {
    const report = await importDrawingFiles(
      files,
      (done, total, name) => {
        toast.loading(
          t('import.progress', { done: done + 1 > total ? total : done + 1, total, name }),
          { id: toastId },
        );
      },
      await importDeps(),
    );
    const drawings = report.drawingIds.length;
    const lines = report.skipped.map((skip) =>
      t(`import.skipped.${skip.reason}`, { name: skip.fileName, detail: skip.detail ?? '' }),
    );
    if (drawings > 0) {
      toast.success(t('import.done', { count: drawings, files: report.imported.length }), {
        id: toastId,
        description: lines.join('\n') || undefined,
      });
      const ui = useUiStore.getState();
      if (!ui.activeDrawingId) ui.openDrawing(report.drawingIds[0]!);
    } else {
      toast.warning(t('import.nothing'), { id: toastId, description: lines.join('\n') });
    }
  } catch (error) {
    toast.error(t('import.failed'), {
      id: toastId,
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Opens the browser file picker for drawings (must be called from a user gesture). */
export function openDrawingImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = IMPORTABLE_EXTENSIONS.join(',');
  input.addEventListener('change', () => {
    void importWithFeedback(input.files ? [...input.files] : []);
  });
  input.click();
}
