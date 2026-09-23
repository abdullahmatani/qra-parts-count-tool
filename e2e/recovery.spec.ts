/**
 * Data safety (roadmap #45): a second tab opens a project read-only and can
 * take over when the first closes it (PRJ-07); a renderer crash loses at most
 * the last two seconds of edits (NFR-05); a torn temporary file from a crash
 * mid-save never stops the project opening (PRJ-04).
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { closeProject } from './helpers';
import { seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

/** A second tab of the app with the same OPFS-backed folder picker as the fixture. */
async function openTab(context: BrowserContext, directory: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((name) => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    };
  }, directory);
  await page.goto('/');
  await page.getByRole('button', { name: /Open project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  return page;
}

async function readProject(page: Page, directory: string): Promise<Record<string, unknown>> {
  const text = await page.evaluate(async (d) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(d);
    return (await (await dir.getFileHandle('project.qrapc.json')).getFile()).text();
  }, directory);
  return JSON.parse(text) as Record<string, unknown>;
}

async function newSegment(page: Page, label: string) {
  await page.getByTestId('left-pane').getByRole('button', { name: 'Segment' }).click();
  const dialog = page.getByRole('dialog', { name: 'New segment' });
  await dialog.getByLabel('Label').fill(label);
  await dialog.getByRole('button', { name: 'Create segment' }).click();
  await expect(dialog).toBeHidden();
}

test('a second tab opens the project read-only until the first closes it (PRJ-07)', async ({
  app,
}) => {
  const dir = `tablock-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }]);
  const first = await openTab(app.page.context(), dir);
  await expect(first.getByText('Read-only', { exact: true })).toHaveCount(0);

  const second = await openTab(app.page.context(), dir);
  await expect(second.getByText('Read-only', { exact: true })).toBeVisible();
  await expect(second.getByText(/open in another tab or window/)).toBeVisible();
  // Edits are refused in the read-only tab.
  await expect(
    second.getByTestId('left-pane').getByRole('button', { name: 'Segment' }),
  ).toBeDisabled();

  // The first tab edits and closes; the second is offered the project.
  await newSegment(first, 'IS-07');
  await expect(first.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await closeProject(first);
  await second.getByRole('button', { name: 'Reopen for editing' }).click();
  await expect(second.getByText('Read-only', { exact: true })).toHaveCount(0);
  // Reopened from disk, so the first tab's last edit is there.
  await expect(second.getByTestId('segment-list')).toContainText('IS-07');
  await first.close();
  await second.close();
  await app.removeDirectory(dir);
});

test('a crash loses no edit older than two seconds (NFR-05)', async ({ app }) => {
  const dir = `crash-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }]);
  const context = app.page.context();
  const page = await openTab(context, dir);

  await newSegment(page, 'IS-01');
  await newSegment(page, 'IS-02');
  const lastEditAt = Date.now();
  // NFR-05 allows the last 2 s to be lost; wait that long, then crash the renderer.
  await page.waitForTimeout(Math.max(0, 2000 - (Date.now() - lastEditAt)));
  const cdp = await context.newCDPSession(page);
  const crashed = page.waitForEvent('crash');
  // The crashed target never answers, so do not wait for the reply.
  void cdp.send('Page.crash').catch(() => {});
  await crashed;

  const after = await openTab(context, dir);
  await expect(after.getByText('Read-only', { exact: true })).toHaveCount(0);
  await expect(after.getByTestId('segment-list')).toContainText('IS-01');
  await expect(after.getByTestId('segment-list')).toContainText('IS-02');
  const project = await readProject(after, dir);
  expect((project.segments as { label: string }[]).map((s) => s.label)).toEqual(['IS-01', 'IS-02']);
  await after.evaluate(async (d) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(d, { recursive: true }).catch(() => {});
  }, dir);
  await after.close();
});

test('a torn temporary file from a crash mid-save is ignored (PRJ-04)', async ({ app }) => {
  const dir = `torn-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }], {
    segments: [{ id: 'seg_1', label: 'IS-01', colour: 1 }],
  });
  const full = JSON.stringify(await readProject(app.page, dir));
  await app.writeText(dir, 'project.qrapc.json.tmp', full.slice(0, Math.floor(full.length / 2)));

  const page = await openTab(app.page.context(), dir);
  await expect(page.getByTestId('segment-list')).toContainText('IS-01');
  await expect.poll(() => app.list(dir)).not.toContain('project.qrapc.json.tmp');
  await page.close();
  await app.removeDirectory(dir);
});
