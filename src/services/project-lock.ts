/**
 * One writable tab per project (PRJ-07). The tab that opens a project holds a
 * Web Lock named after it; a second tab that cannot get the lock opens the
 * project read-only. The browser releases a tab's locks when the tab closes or
 * crashes, so a stale lock can never keep a project read-only.
 */

export interface ProjectLock {
  release(): void;
}

/** Minimal slice of the Web Locks API, so tests can supply their own. */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void> | undefined,
  ): Promise<unknown>;
}

function defaultLocks(): LockManagerLike | null {
  return typeof navigator !== 'undefined' && 'locks' in navigator
    ? (navigator.locks as unknown as LockManagerLike)
    : null;
}

/**
 * Keyed by project id and folder name: a copied study keeps its id, and the
 * copy in another folder must not be locked by the original.
 */
export function projectLockName(projectId: string, directoryName: string): string {
  return `qrapc:${projectId}:${directoryName}`;
}

/** Takes the lock if no other tab holds it; null when another tab does. */
export function tryLockProject(
  name: string,
  locks: LockManagerLike | null = defaultLocks(),
): Promise<ProjectLock | null> {
  // Without the API (older browsers) there is nothing to coordinate with.
  if (!locks) return Promise.resolve({ release() {} });
  return new Promise((resolve, reject) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        // Held until release() settles this promise.
        return new Promise<void>((release) => resolve({ release: () => release() }));
      })
      .catch(reject);
  });
}

/**
 * Waits for the lock (the other tab closes the project). Resolves with the
 * held lock, or null when `signal` aborts first.
 */
export function waitForProjectLock(
  name: string,
  signal: AbortSignal,
  locks: LockManagerLike | null = defaultLocks(),
): Promise<ProjectLock | null> {
  if (!locks) return Promise.resolve(null);
  return new Promise((resolve) => {
    locks
      .request(name, { signal }, () => {
        if (signal.aborted) {
          resolve(null);
          return undefined;
        }
        return new Promise<void>((release) => resolve({ release: () => release() }));
      })
      .catch(() => resolve(null));
  });
}
