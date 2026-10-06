/**
 * Starting the guided tour: closes the open project (it is saved), builds the
 * practice project in memory and opens it. Nothing is written to the
 * computer, so no folder is needed, in any browser.
 */
import { toast } from 'sonner';
import { starterLibrary } from '@/domain/count/starter-library';
import { projectToDoc } from '@/domain/model';
import { closeProject } from '@/features/project/project-actions';
import { SAMPLE_FILE, buildTourProject } from '@/features/sample/sample-project';
import i18n from '@/i18n';
import { writeFile } from '@/lib/fs/files';
import { createMemoryFs } from '@/lib/fs/memory';
import { sha256Hex } from '@/lib/hash';
import { createProjectInDirectory } from '@/services/project-io';
import { beginSession } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useTourStore } from './tour-store';

const t = i18n.t.bind(i18n);

/** Builds the practice project in memory and opens it; returns its id. */
export async function openPracticeProject(now = new Date()): Promise<string> {
  const { drawSamplePdf } = await import('@/features/sample/sample-drawing');
  const bytes = await drawSamplePdf();
  const project = buildTourProject(
    starterLibrary(),
    { hash: await sha256Hex(bytes) },
    now,
    __APP_VERSION__,
  );
  const dir = createMemoryFs(t('tour.folder'));
  await createProjectInDirectory(dir, project);
  await writeFile(dir, `drawings/${SAMPLE_FILE}`, new Blob([bytes as Uint8Array<ArrayBuffer>]));
  await beginSession(dir, projectToDoc(project), { savedAt: now, remember: false, inMemory: true });
  return project.id;
}

let starting = false;

/** Main menu action: starts the guided tour on a fresh practice project. */
export async function startGuidedTour(): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    if (useProjectStore.getState().doc) await closeProject();
    const projectId = await openPracticeProject();
    useTourStore.getState().start(projectId);
  } catch (error) {
    toast.error(t('tour.failed'), {
      description: error instanceof Error ? error.message : String(error),
    });
  } finally {
    starting = false;
  }
}

/** Whether the open project is the tour's practice project. */
export function usePracticeProject(): boolean {
  const projectId = useTourStore((s) => s.projectId);
  return useProjectStore((s) => projectId !== null && s.doc?.id === projectId);
}
