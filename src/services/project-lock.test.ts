import { describe, expect, it } from 'vitest';
import {
  projectLockName,
  tryLockProject,
  waitForProjectLock,
  type LockManagerLike,
} from './project-lock';

/** An in-memory stand-in for navigator.locks (exclusive locks, FIFO queue). */
function fakeLocks(): LockManagerLike {
  const held = new Set<string>();
  const queue = new Map<string, (() => void)[]>();
  const grant = async (
    name: string,
    callback: (lock: unknown) => Promise<void> | undefined,
  ): Promise<void> => {
    held.add(name);
    try {
      await callback({ name });
    } finally {
      held.delete(name);
      queue.get(name)?.shift()?.();
    }
  };
  return {
    request(name, options, callback) {
      if (!held.has(name)) return grant(name, callback);
      if (options.ifAvailable) return Promise.resolve(callback(null));
      return new Promise<void>((resolve, reject) => {
        const waiting = () => void grant(name, callback).then(resolve, reject);
        options.signal?.addEventListener('abort', () => {
          const list = queue.get(name) ?? [];
          queue.set(
            name,
            list.filter((f) => f !== waiting),
          );
          reject(new DOMException('Aborted', 'AbortError'));
        });
        queue.set(name, [...(queue.get(name) ?? []), waiting]);
      });
    },
  };
}

describe('project tab lock (PRJ-07)', () => {
  const name = projectLockName('prj_1', 'Plant A');

  it('lets one tab hold a project and the next open it read-only', async () => {
    const locks = fakeLocks();
    const first = await tryLockProject(name, locks);
    expect(first).not.toBeNull();
    expect(await tryLockProject(name, locks)).toBeNull();
    // Another folder with a copy of the project is a different lock.
    expect(await tryLockProject(projectLockName('prj_1', 'Plant A copy'), locks)).not.toBeNull();
    first!.release();
    await Promise.resolve();
    expect(await tryLockProject(name, locks)).not.toBeNull();
  });

  it('hands the lock to a waiting read-only tab when the first closes', async () => {
    const locks = fakeLocks();
    const first = await tryLockProject(name, locks);
    const waiting = waitForProjectLock(name, new AbortController().signal, locks);
    first!.release();
    const second = await waiting;
    expect(second).not.toBeNull();
    expect(await tryLockProject(name, locks)).toBeNull();
  });

  it('stops waiting when the read-only session ends', async () => {
    const locks = fakeLocks();
    await tryLockProject(name, locks);
    const controller = new AbortController();
    const waiting = waitForProjectLock(name, controller.signal, locks);
    controller.abort();
    expect(await waiting).toBeNull();
  });

  it('allows editing where the browser has no Web Locks', async () => {
    expect(await tryLockProject(name, null)).not.toBeNull();
  });
});
