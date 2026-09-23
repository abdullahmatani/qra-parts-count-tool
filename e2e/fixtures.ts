/**
 * Shared Playwright fixtures.
 *
 * - The native folder picker cannot be driven by Playwright, so an init script
 *   replaces `showDirectoryPicker` with one that returns a folder in the
 *   browser's Origin Private File System (OPFS). OPFS handles implement the
 *   same File System Access API as a real folder, so the app code under test
 *   is unchanged.
 * - Every request the page makes is recorded, so tests can assert that no data
 *   leaves the browser (FDS section 2).
 * - With the `offlineMode` option (the `chromium-offline` project), the app is
 *   loaded once online so the service worker caches it, then the network is
 *   cut and the page reloaded before the test body runs (NFR-01).
 */
import { test as base, expect, type Page, type Request } from '@playwright/test';

declare global {
  interface Window {
    /** OPFS folder name returned by the next showDirectoryPicker() call. */
    __e2eNextDirectory?: string;
  }
}

export interface AppFixture {
  page: Page;
  /** Loads the app (priming the service worker and going offline in offline mode). */
  open(): Promise<void>;
  /** Sets the OPFS folder the next folder-picker call returns. */
  pickDirectory(name: string): Promise<void>;
  /** Reads a text file from an OPFS folder, e.g. readText('study', 'project.qrapc.json'). */
  readText(directory: string, path: string): Promise<string>;
  /** Lists entry names in an OPFS folder (optionally a sub-path). */
  list(directory: string, path?: string): Promise<string[]>;
  /** Writes a text file into an OPFS folder, creating sub-folders as needed. */
  writeText(directory: string, path: string, content: string): Promise<void>;
  /** Removes an OPFS folder. */
  removeDirectory(directory: string): Promise<void>;
  /** All requests made by the page so far. */
  requests: Request[];
  /** Requests that left the app's origin (checked automatically after every test). */
  foreignRequests(): string[];
  /** Skips the automatic egress check, for tests that deliberately attempt a foreign request. */
  allowForeignRequestAttempts(): void;
}

export const test = base.extend<{ app: AppFixture }, { offlineMode: boolean }>({
  offlineMode: [false, { option: true, scope: 'worker' }],

  app: async ({ page, context, offlineMode }, use) => {
    const requests: Request[] = [];
    let checkEgress = true;
    page.on('request', (request) => requests.push(request));

    await page.addInitScript(() => {
      window.showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory();
        const name = window.__e2eNextDirectory ?? 'workdir';
        return root.getDirectoryHandle(name, { create: true });
      };
    });

    const fixture: AppFixture = {
      page,
      requests,
      allowForeignRequestAttempts() {
        checkEgress = false;
      },
      foreignRequests() {
        const origin = new URL(page.url() === 'about:blank' ? 'http://localhost:4173' : page.url())
          .origin;
        return requests
          .map((request) => request.url())
          .filter(
            (url) =>
              !url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:'),
          );
      },
      async open() {
        await page.goto('/');
        await expect(page.locator('#root')).not.toBeEmpty();
        if (offlineMode) {
          await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) {
              await new Promise<void>((resolve) =>
                navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
                  once: true,
                }),
              );
            }
          });
          await context.setOffline(true);
          await page.reload();
          await expect(page.locator('#root')).not.toBeEmpty();
        }
      },
      async pickDirectory(name) {
        await page.evaluate((n) => {
          window.__e2eNextDirectory = n;
        }, name);
      },
      async readText(directory, path) {
        return page.evaluate(
          async ([d, p]) => {
            const root = await navigator.storage.getDirectory();
            let dir = await root.getDirectoryHandle(d!);
            const parts = p!.split('/').filter(Boolean);
            const fileName = parts.pop()!;
            for (const part of parts) dir = await dir.getDirectoryHandle(part);
            const file = await (await dir.getFileHandle(fileName)).getFile();
            return file.text();
          },
          [directory, path],
        );
      },
      async list(directory, path = '') {
        return page.evaluate(
          async ([d, p]) => {
            const root = await navigator.storage.getDirectory();
            let dir = await root.getDirectoryHandle(d!);
            for (const part of p!.split('/').filter(Boolean))
              dir = await dir.getDirectoryHandle(part);
            const names: string[] = [];
            for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
              names.push(name);
            }
            return names.sort();
          },
          [directory, path],
        );
      },
      async writeText(directory, path, content) {
        await page.evaluate(
          async ([d, p, c]) => {
            const root = await navigator.storage.getDirectory();
            let dir = await root.getDirectoryHandle(d!, { create: true });
            const parts = p!.split('/').filter(Boolean);
            const fileName = parts.pop()!;
            for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
            const handle = await dir.getFileHandle(fileName, { create: true });
            const writable = await handle.createWritable();
            await writable.write(c!);
            await writable.close();
          },
          [directory, path, content],
        );
      },
      async removeDirectory(directory) {
        await page.evaluate(async (d) => {
          const root = await navigator.storage.getDirectory();
          await root.removeEntry(d, { recursive: true }).catch(() => {});
        }, directory);
      },
    };
    await use(fixture);

    // Every end-to-end test doubles as a data-egress check (FDS section 2).
    if (checkEgress) {
      expect(fixture.foreignRequests(), 'requests to a third-party origin').toEqual([]);
    }
  },
});

export { expect };
