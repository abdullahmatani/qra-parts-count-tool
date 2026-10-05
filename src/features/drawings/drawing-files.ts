/**
 * The files in `drawings/` (DRW-03, DRW-04). Importing copies a file in; once
 * no drawing uses a file any more (its drawings were deleted, or their import
 * undone), the file is taken out again together with its render cache, so the
 * folder holds the project's drawings only and importing the file again starts
 * afresh. A removed file is kept in memory for the rest of the session and
 * written back when Undo or Redo brings back a drawing that uses it. Changes
 * to `drawings/` run one at a time, so an import never races a removal.
 */
import type { ProjectDoc } from '@/domain/model';
import type { Drawing } from '@/domain/schema/types';
import { CAD_CACHE_DIR } from '@/features/cad/cad-cache';
import { PREVIEW_CACHE_DIR } from '@/features/viewer/preview-cache';
import {
  exists,
  getDirectory,
  listEntries,
  readFile,
  removeIfExists,
  sanitizeFileName,
  uniqueFileName,
  writeFile,
} from '@/lib/fs/files';
import { isNotFound, type FsDirHandle } from '@/lib/fs/types';
import { sha256Hex } from '@/lib/hash';
import { useProjectStore, type ProjectState } from '@/store/project-store';

/** A file taken out of `drawings/` this session, kept so Undo can bring it back. */
interface RemovedFile {
  fileName: string;
  fileHash: string;
  data: Blob;
}

export interface DrawingFilesOptions {
  /**
   * Runs before a file is removed: saving the project first means a crash can
   * never leave the project file pointing at a file that is gone.
   */
  beforeRemove?: () => Promise<void>;
}

const usesFile = (doc: ProjectDoc, fileName: string, fileHash?: string) =>
  Object.values(doc.drawings).some(
    (d) => d.fileName === fileName && (fileHash === undefined || d.fileHash === fileHash),
  );

class DrawingFiles {
  private dir: FsDirHandle | null = null;
  private unsubscribe: (() => void) | null = null;
  private options: DrawingFilesOptions = {};
  /** Removed files by lower-case name; their names stay reserved for them. */
  private readonly removed = new Map<string, RemovedFile>();
  private queue: Promise<unknown> = Promise.resolve();

  start(dir: FsDirHandle, options: DrawingFilesOptions = {}): void {
    this.unsubscribe?.();
    this.removed.clear();
    this.dir = dir;
    this.options = options;
    this.unsubscribe = useProjectStore.subscribe((state, previous) =>
      this.onChange(state, previous),
    );
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.idle();
    this.removed.clear();
    this.dir = null;
  }

  /** Resolves once every queued change to `drawings/` is done. */
  async idle(): Promise<void> {
    let current: Promise<unknown>;
    do {
      current = this.queue;
      await current;
    } while (current !== this.queue);
  }

  /** Runs a change to `drawings/` after the ones queued before it. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  private background(task: () => Promise<void>): void {
    void this.run(task).catch((error: unknown) => {
      console.warn('Could not update the drawings folder', error);
    });
  }

  private onChange(state: ProjectState, previous: ProjectState): void {
    const { doc } = state;
    const before = previous.doc;
    if (!doc || !before || doc.id !== before.id || doc.drawings === before.drawings) return;
    // Only edits (including undo and redo) let files go. Loading a document
    // (opening the project, restoring a backup) resets the counter and never
    // removes files.
    if (state.changeCounter > previous.changeCounter) {
      const gone = Object.values(before.drawings).filter((d) => !doc.drawings[d.id]);
      if (gone.length > 0) this.background(() => this.release(gone));
    }
    if (this.removed.size > 0) this.background(() => this.restore());
  }

  /** Removes the files of deleted drawings that no other drawing uses. */
  private async release(drawings: readonly Drawing[]): Promise<void> {
    const dir = this.dir;
    const files = new Map(drawings.map((d) => [d.fileName, d.fileHash]));
    const stillUnused = (fileName: string) => {
      const { doc, readOnly } = useProjectStore.getState();
      return !!doc && !readOnly && !usesFile(doc, fileName);
    };
    if (!dir || ![...files.keys()].some(stillUnused)) return;
    await this.options.beforeRemove?.();
    for (const [fileName, fileHash] of files) {
      if (this.dir !== dir || !stillUnused(fileName)) continue;
      const path = `drawings/${fileName}`;
      let data: Blob;
      try {
        // Copy the bytes: a File read from disk becomes unreadable once the file is removed.
        const file = await readFile(dir, path);
        data = new Blob([await file.arrayBuffer()], { type: file.type });
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }
      this.removed.set(fileName.toLowerCase(), { fileName, fileHash, data });
      await removeIfExists(dir, path);
      const doc = useProjectStore.getState().doc;
      if (doc && !Object.values(doc.drawings).some((d) => d.fileHash === fileHash)) {
        // The caches are rebuildable, so failing to clear them changes nothing.
        await removeCaches(dir, fileHash).catch(() => {});
      }
    }
  }

  /** Writes back removed files that a drawing uses again (after Undo or Redo). */
  private async restore(): Promise<void> {
    const dir = this.dir;
    const { doc, readOnly } = useProjectStore.getState();
    if (!dir || !doc || readOnly) return;
    for (const [key, file] of this.removed) {
      if (!usesFile(doc, file.fileName, file.fileHash)) continue;
      const path = `drawings/${file.fileName}`;
      if (!(await exists(dir, path))) await writeFile(dir, path, file.data);
      this.removed.delete(key);
    }
  }

  /**
   * Copies a file into `drawings/`. An identical copy already there (or one
   * removed this session) is reused instead of creating a duplicate; another
   * file with the same name gets a numbered name.
   */
  copyIn(dir: FsDirHandle, fileName: string, bytes: ArrayBuffer, hash: string): Promise<string> {
    return this.run(async () => {
      const drawingsDir = await getDirectory(dir, 'drawings', { create: true });
      const safe = sanitizeFileName(fileName, 'drawing');
      try {
        const existing = await readFile(dir, `drawings/${safe}`);
        if (
          existing.size === bytes.byteLength &&
          (await sha256Hex(await existing.arrayBuffer())) === hash
        ) {
          return safe;
        }
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      const removed = dir === this.dir ? this.removed : new Map<string, RemovedFile>();
      const same = removed.get(safe.toLowerCase());
      const name =
        same?.fileHash === hash
          ? same.fileName
          : await uniqueFileName(
              drawingsDir,
              safe,
              [...removed.values()].map((file) => file.fileName),
            );
      await writeFile(dir, `drawings/${name}`, bytes);
      return name;
    });
  }
}

async function removeCaches(dir: FsDirHandle, fileHash: string): Promise<void> {
  await removeIfExists(dir, `${CAD_CACHE_DIR}/${fileHash}`, { recursive: true });
  let previews: { name: string }[];
  try {
    previews = await listEntries(dir, PREVIEW_CACHE_DIR);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  for (const entry of previews) {
    if (entry.name.startsWith(`${fileHash}-`)) {
      await removeIfExists(dir, `${PREVIEW_CACHE_DIR}/${entry.name}`);
    }
  }
}

export const drawingFiles = new DrawingFiles();

/** Copies a file into `drawings/` and returns its name there (see DrawingFiles.copyIn). */
export function copyIntoDrawings(
  dir: FsDirHandle,
  fileName: string,
  bytes: ArrayBuffer,
  hash: string,
): Promise<string> {
  return drawingFiles.copyIn(dir, fileName, bytes, hash);
}

/** Connects the drawing files to the session lifecycle. */
export function installDrawingFiles(
  registerHook: (hook: {
    onBegin?: (dir: FsDirHandle) => void;
    onEnd?: () => Promise<void>;
  }) => () => void,
  options: DrawingFilesOptions = {},
): () => void {
  return registerHook({
    onBegin: (dir) => drawingFiles.start(dir, options),
    onEnd: () => drawingFiles.stop(),
  });
}
