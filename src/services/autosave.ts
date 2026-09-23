/**
 * Autosave (PRJ-04, PRJ-05, NFR-05).
 *
 * Every change to the project document schedules a save. The save starts
 * {@link AutosaveOptions.debounceMs} after the last edit, and never later than
 * {@link AutosaveOptions.maxWaitMs} after the first unsaved edit, so at most
 * about two seconds of work is ever unsaved. Each save writes the project file
 * atomically (temporary file, then rename) and, at most once per
 * {@link AutosaveOptions.snapshotIntervalMs}, keeps a snapshot in `.backup/`.
 */
import { docToProject, type ProjectDoc } from '@/domain/model';
import { PROJECT_FILE_NAME, serializeProject } from '@/domain/schema';
import { writeTextAtomic } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';
import { useProjectStore } from '@/store/project-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { takeSnapshot } from './backups';

export interface AutosaveOptions {
  debounceMs: number;
  maxWaitMs: number;
  retryMs: number;
  snapshotIntervalMs: number;
  appVersion: string;
  now: () => Date;
}

export const DEFAULT_AUTOSAVE_OPTIONS: AutosaveOptions = {
  debounceMs: 750,
  maxWaitMs: 1500,
  retryMs: 5000,
  snapshotIntervalMs: 60_000,
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
  now: () => new Date(),
};

/** Builds the file content for a save: next revision, timestamp and writer. */
export function prepareSave(
  doc: ProjectDoc,
  now: Date,
  appVersion: string,
): { text: string; revision: number; updatedAt: string } {
  const revision = doc.revision + 1;
  const updatedAt = now.toISOString();
  const project = docToProject({
    ...doc,
    revision,
    updatedAt,
    app: { name: 'qra-parts-count-tool', version: appVersion },
  });
  return { text: serializeProject(project), revision, updatedAt };
}

export class AutosaveController {
  private dir: FsDirHandle | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPendingAt: number | null = null;
  private inFlight: Promise<void> | null = null;
  private dirty = false;
  private lastSnapshotAt = Number.NEGATIVE_INFINITY;
  private readonly options: AutosaveOptions;

  constructor(options: Partial<AutosaveOptions> = {}) {
    this.options = { ...DEFAULT_AUTOSAVE_OPTIONS, ...options };
  }

  get isDirty(): boolean {
    return this.dirty || this.inFlight !== null;
  }

  /** Starts watching the project store; takes an opening snapshot of the file state. */
  start(dir: FsDirHandle, { snapshotOnStart = true } = {}): void {
    this.stop();
    this.dir = dir;
    this.dirty = false;
    this.lastSnapshotAt = Number.NEGATIVE_INFINITY;
    this.unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.changeCounter !== previous.changeCounter) this.onChange();
    });
    if (snapshotOnStart) {
      // Snapshot of the project as opened, so the session can always be undone.
      const doc = useProjectStore.getState().doc;
      if (doc) {
        const now = this.options.now();
        this.lastSnapshotAt = now.getTime();
        const text = serializeProject(docToProject(doc));
        void takeSnapshot(dir, text, doc.revision, now).catch(() => {});
      }
    }
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.firstPendingAt = null;
    this.dir = null;
  }

  private onChange(): void {
    if (!this.dir || useProjectStore.getState().readOnly) return;
    this.dirty = true;
    if (!this.inFlight) useWorkspaceStore.getState().setSaveStatus('pending');
    this.schedule();
  }

  private schedule(delay?: number): void {
    if (this.timer) clearTimeout(this.timer);
    const now = Date.now();
    this.firstPendingAt ??= now;
    const wait =
      delay ??
      Math.min(
        this.options.debounceMs,
        Math.max(0, this.firstPendingAt + this.options.maxWaitMs - now),
      );
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, wait);
  }

  /** Saves immediately if there are unsaved changes. */
  async saveNow(): Promise<void> {
    // One write at a time: wait until no other save is running.
    while (this.inFlight) {
      await this.inFlight.catch(() => {});
    }
    const dir = this.dir;
    const doc = useProjectStore.getState().doc;
    if (!this.dirty || !dir || !doc) return;

    this.dirty = false;
    this.firstPendingAt = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    const now = this.options.now();
    const { text, revision, updatedAt } = prepareSave(doc, now, this.options.appVersion);
    const workspace = useWorkspaceStore.getState();
    workspace.setSaveStatus('saving');

    const run = async () => {
      await writeTextAtomic(dir, PROJECT_FILE_NAME, text);
      useProjectStore.getState().markSaved({ revision, updatedAt });
      if (now.getTime() - this.lastSnapshotAt >= this.options.snapshotIntervalMs) {
        this.lastSnapshotAt = now.getTime();
        await takeSnapshot(dir, text, revision, now).catch(() => {
          // A failed snapshot must not fail the save itself.
        });
      }
    };

    this.inFlight = run();
    try {
      await this.inFlight;
      if (this.dirty) workspace.setSaveStatus('pending');
      else workspace.markSaved(now);
    } catch (error) {
      this.dirty = true;
      workspace.setSaveStatus('error', error instanceof Error ? error.message : String(error));
      this.schedule(this.options.retryMs);
      return;
    } finally {
      this.inFlight = null;
    }
    if (this.dirty) this.schedule();
  }

  /** Marks the document as changed and saves it straight away (e.g. after a restore). */
  async requestSave(): Promise<void> {
    if (!this.dir) return;
    this.dirty = true;
    await this.saveNow();
  }

  /** Waits for any save in progress and writes pending changes (e.g. before closing). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.inFlight) await this.inFlight.catch(() => {});
    if (this.dirty) await this.saveNow();
  }
}

export const autosave = new AutosaveController();

/** Connects autosave to the session lifecycle and to page unload. */
export function installAutosave(
  registerHook: (hook: {
    onBegin?: (dir: FsDirHandle) => void;
    onEnd?: () => Promise<void>;
  }) => () => void,
  controller: AutosaveController = autosave,
): () => void {
  const unregister = registerHook({
    onBegin: (dir) => controller.start(dir),
    onEnd: async () => {
      await controller.flush();
      controller.stop();
    },
  });
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!controller.isDirty) return;
    void controller.flush();
    event.preventDefault();
  };
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void controller.flush();
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onHidden);
  return () => {
    unregister();
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('visibilitychange', onHidden);
  };
}
