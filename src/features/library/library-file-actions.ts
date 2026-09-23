/**
 * CNT-11: export the project's equipment library as a file, and import one
 * from another project (merged, as one undo step).
 */
import { toast } from 'sonner';
import {
  LibraryFileError,
  mergeLibrary,
  parseLibraryFile,
  toLibraryFile,
} from '@/domain/library-file';
import { sanitizeFileName } from '@/lib/fs/files';
import { downloadText } from '@/lib/download';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';

const t = i18n.t.bind(i18n);

export function exportLibraryFile(now = new Date()): void {
  const doc = useProjectStore.getState().doc;
  if (!doc) return;
  const name = sanitizeFileName(doc.library.datasetName || doc.name, 'library');
  downloadText(
    `${name}.library.json`,
    `${JSON.stringify(toLibraryFile(doc.library, now), null, 2)}\n`,
  );
}

export async function importLibraryFile(file: File): Promise<boolean> {
  const project = useProjectStore.getState();
  if (!project.doc) return false;
  try {
    const incoming = parseLibraryFile(await file.text());
    const { library, summary } = mergeLibrary(project.doc.library, incoming);
    const done = project.apply(t('library.history.import', { file: file.name }), (draft) => {
      draft.library = library;
    });
    if (done) toast.success(t('library.file.imported', { ...summary }));
    return done;
  } catch (error) {
    toast.error(t('library.file.importFailed'), {
      description:
        error instanceof LibraryFileError || error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
