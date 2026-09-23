/**
 * "Try the sample project" (roadmap #46): writes the sample PEFS and its
 * marked-up project into an empty folder the user picks, then opens it.
 * The drawing is generated on the spot, so the app ships no sample files.
 */
import { toast } from 'sonner';
import { starterLibrary } from '@/domain/count/starter-library';
import { projectToDoc } from '@/domain/model';
import i18n from '@/i18n';
import { writeFile } from '@/lib/fs/files';
import { sha256Hex } from '@/lib/hash';
import type { FsDirHandle } from '@/lib/fs/types';
import { pickWorkingDirectory } from '@/features/project/project-actions';
import { ProjectExistsError, createProjectInDirectory } from '@/services/project-io';
import { projectLockName, tryLockProject } from '@/services/project-lock';
import { beginSession } from '@/services/session';
import { SAMPLE_FILE, buildSampleProject } from './sample-project';

const t = i18n.t.bind(i18n);

export async function createSampleProject(dir: FsDirHandle): Promise<'created' | 'exists'> {
  const { drawSamplePdf } = await import('./sample-drawing');
  const bytes = await drawSamplePdf();
  const project = buildSampleProject(
    starterLibrary(),
    { hash: await sha256Hex(bytes) },
    new Date(),
    __APP_VERSION__,
  );
  try {
    await createProjectInDirectory(dir, project);
  } catch (error) {
    if (error instanceof ProjectExistsError) return 'exists';
    throw error;
  }
  await writeFile(dir, `drawings/${SAMPLE_FILE}`, new Blob([bytes as Uint8Array<ArrayBuffer>]));
  const lock = await tryLockProject(projectLockName(project.id, dir.name));
  await beginSession(dir, projectToDoc(project), { savedAt: new Date(), lock });
  return 'created';
}

/** Start screen action: pick a folder, create the sample in it, report the outcome. */
export async function openSampleFromPicker(): Promise<void> {
  const dir = await pickWorkingDirectory();
  if (!dir) return;
  try {
    const result = await createSampleProject(dir);
    if (result === 'exists') toast.error(t('start.sampleExists'));
    else toast.success(t('start.sampleCreated'));
  } catch (error) {
    toast.error(t('start.sampleFailed'), {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}
