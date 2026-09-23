/**
 * Reading and writing the project in its working directory (PRJ-01..05).
 */
import { docToProject, projectToDoc, type ProjectDoc } from '@/domain/model';
import {
  PROJECT_FILE_NAME,
  ProjectFileError,
  checkIntegrity,
  parseProjectFile,
  serializeProject,
  type IntegrityIssue,
  type ParsedProjectFile,
  type Project,
} from '@/domain/schema';
import {
  exists,
  getDirectory,
  readTextIfExists,
  removeIfExists,
  writeFile,
  writeTextAtomic,
} from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';

/** Folders created in every working directory (FDS section 5). */
export const WORKDIR_FOLDERS = ['drawings', 'cache', 'templates', 'exports', '.backup'] as const;
export const TEMP_PROJECT_FILE = `${PROJECT_FILE_NAME}.tmp`;
export const BACKUP_FOLDER = '.backup';

export class ProjectExistsError extends Error {
  constructor() {
    super('This folder already contains a project. Open it instead, or choose another folder.');
    this.name = 'ProjectExistsError';
  }
}

/** Creates any missing working-directory folders (PRJ-02). */
export async function ensureFolderStructure(dir: FsDirHandle): Promise<void> {
  for (const folder of WORKDIR_FOLDERS) await getDirectory(dir, folder, { create: true });
}

export async function hasProjectFile(dir: FsDirHandle): Promise<boolean> {
  return exists(dir, PROJECT_FILE_NAME);
}

/**
 * Creates a new project in an empty or existing folder (PRJ-01, PRJ-02). Refuses
 * a folder that already holds a project file, so nothing is ever overwritten.
 */
export async function createProjectInDirectory(dir: FsDirHandle, project: Project): Promise<void> {
  if ((await hasProjectFile(dir)) || (await exists(dir, TEMP_PROJECT_FILE))) {
    throw new ProjectExistsError();
  }
  await ensureFolderStructure(dir);
  await writeTextAtomic(dir, PROJECT_FILE_NAME, serializeProject(project));
}

/** Writes the project file atomically (PRJ-04). */
export async function saveProjectFile(dir: FsDirHandle, project: Project): Promise<void> {
  await writeTextAtomic(dir, PROJECT_FILE_NAME, serializeProject(project));
}

export interface OpenedProject {
  doc: ProjectDoc;
  /** Schema version the file was upgraded from, or null. */
  migratedFrom: number | null;
  /** True when unsaved work was recovered from the temporary file after a crash. */
  recoveredFromTemp: boolean;
  integrityIssues: IntegrityIssue[];
  /** False when another tab holds the project (PRJ-07): nothing was written. */
  writable: boolean;
}

export interface OpenOptions {
  /**
   * Asked once the file is read and before anything is written, with the
   * project id. Returning false opens the project without touching the folder.
   */
  claim?: (projectId: string) => Promise<boolean>;
}

function tryParse(text: string | null): ParsedProjectFile | ProjectFileError | null {
  if (text === null) return null;
  try {
    return parseProjectFile(text);
  } catch (error) {
    if (error instanceof ProjectFileError) return error;
    throw error;
  }
}

function fileStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Opens the project in `dir` (PRJ-03): validates the file and its schema
 * version, recovers a newer complete temporary file left by a crash (PRJ-04),
 * and migrates older schema versions after keeping a backup of the original.
 */
export async function openProjectFromDirectory(
  dir: FsDirHandle,
  now: Date = new Date(),
  options: OpenOptions = {},
): Promise<OpenedProject> {
  const mainText = await readTextIfExists(dir, PROJECT_FILE_NAME);
  const tempText = await readTextIfExists(dir, TEMP_PROJECT_FILE);
  const main = tryParse(mainText);
  const temp = tryParse(tempText);

  let chosen: ParsedProjectFile;
  let chosenText: string;
  let recoveredFromTemp = false;
  const tempUsable = temp !== null && !(temp instanceof ProjectFileError);
  const mainUsable = main !== null && !(main instanceof ProjectFileError);

  if (tempUsable && (!mainUsable || temp.project.revision > main.project.revision)) {
    chosen = temp;
    chosenText = tempText!;
    recoveredFromTemp = true;
  } else if (mainUsable) {
    chosen = main;
    chosenText = mainText!;
  } else if (main instanceof ProjectFileError) {
    throw main;
  } else {
    throw new ProjectFileError(
      'missing',
      `No ${PROJECT_FILE_NAME} was found in the folder "${dir.name}".`,
    );
  }

  const writable = options.claim ? await options.claim(chosen.project.id) : true;
  if (!writable) {
    return {
      doc: projectToDoc(chosen.project),
      migratedFrom: chosen.migratedFrom,
      recoveredFromTemp,
      integrityIssues: checkIntegrity(chosen.project),
      writable,
    };
  }

  if (chosen.migratedFrom !== null) {
    // FDS section 5: keep a backup of the original before migrating.
    await writeFile(
      dir,
      `${BACKUP_FOLDER}/pre-migration-v${chosen.migratedFrom}-${fileStamp(now)}.qrapc.json`,
      chosenText,
    );
  }
  if (recoveredFromTemp || chosen.migratedFrom !== null) {
    await saveProjectFile(dir, chosen.project);
  }
  if (tempText !== null) await removeIfExists(dir, TEMP_PROJECT_FILE);
  await ensureFolderStructure(dir);

  return {
    doc: projectToDoc(chosen.project),
    migratedFrom: chosen.migratedFrom,
    recoveredFromTemp,
    integrityIssues: checkIntegrity(chosen.project),
    writable,
  };
}

/** Serialises the runtime document for saving. */
export function docToFileText(doc: ProjectDoc): string {
  return serializeProject(docToProject(doc));
}
