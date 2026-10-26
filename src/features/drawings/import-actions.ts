import { toast } from 'sonner';
import { missingCount } from '@/features/cad/display-list';
import { missingLines } from '@/features/cad/missing-content';
import i18n from '@/i18n';
import { usePreferences } from '@/store/preferences';
import { useUiStore } from '@/store/ui-store';
import { IMPORTABLE_EXTENSIONS, importDrawingFiles, type ImportDeps } from './import-drawings';
import { inspectPdf } from './pdf-inspect';
import { useSpacePicker } from './space-picker-store';

/** Production dependencies: PDF.js inspection, the CAD workers and the space picker. */
async function importDeps(unitId: string | null): Promise<ImportDeps> {
  const [client, cache] = await Promise.all([
    import('@/features/cad/cad-client'),
    import('@/features/cad/cad-cache'),
  ]);
  return {
    inspect: inspectPdf,
    now: () => new Date(),
    nameFromFile: usePreferences.getState().drawingNamesFromFiles,
    unitId,
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

/**
 * Imports files with progress and a summary toast; opens the first new
 * drawing. With a plant unit, the new drawings are filed under it (DRW-11).
 */
export async function importWithFeedback(
  files: readonly File[],
  unitId: string | null = null,
): Promise<void> {
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
      await importDeps(unitId),
    );
    const drawings = report.drawingIds.length;
    const lines = report.skipped.map((skip) =>
      t(`import.skipped.${skip.reason}`, { name: skip.fileName, detail: skip.detail ?? '' }),
    );
    // DRW-02: content a CAD drawing cannot show is reported, never dropped silently.
    for (const { fileName, space, missing } of report.incomplete) {
      lines.push(
        t('import.incomplete', {
          name: fileName,
          space,
          count: missingCount(missing),
          list: missingLines(missing)
            .map((line) => line.text)
            .join('; '),
        }),
      );
    }
    if (report.incomplete.length > 0) lines.push(t('import.incompleteHint'));
    if (drawings > 0) {
      const title = t('import.done', { count: drawings, files: report.imported.length });
      const options = { id: toastId, description: lines.join('\n') || undefined };
      if (report.incomplete.length > 0) toast.warning(title, { ...options, duration: 20_000 });
      else toast.success(title, options);
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

function pickAndImport(unitId: string | null): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = IMPORTABLE_EXTENSIONS.join(',');
  input.addEventListener('change', () => {
    void importWithFeedback(input.files ? [...input.files] : [], unitId);
  });
  input.click();
}

/** Opens the browser file picker for drawings (must be called from a user gesture). */
export function openDrawingImport(): void {
  pickAndImport(null);
}

/** Opens the file picker for drawings to file under a plant unit (DRW-11). */
export function openDrawingImportIntoUnit(unitId: string): void {
  pickAndImport(unitId);
}
