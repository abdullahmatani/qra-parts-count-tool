import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export async function createProject(
  page: Page,
  options: { name: string; client?: string; rule?: RegExp; flange?: RegExp },
) {
  await page.getByRole('button', { name: /New project/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('button', { name: 'Choose folder…' }).click();
  await dialog.getByLabel('Project name').fill(options.name);
  if (options.client) await dialog.getByLabel('Client').fill(options.client);
  await dialog.getByRole('radio', { name: options.rule ?? /Upstream segment/ }).click();
  await dialog.getByRole('radio', { name: options.flange ?? /Per flanged joint/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
}

/**
 * Moves the study to a stage with the header's switcher; starting the count
 * goes through its check of the segments.
 */
export async function setStage(page: Page, stage: 'segments' | 'count') {
  const switcher = page.getByTestId('stage-switcher');
  if ((await switcher.getAttribute('data-stage')) === stage) return;
  await switcher
    .getByRole('radio', { name: stage === 'count' ? /Parts count/ : /Segments/ })
    .click();
  if (stage === 'count') {
    const dialog = page.getByRole('dialog', { name: 'Start the parts count?' });
    await dialog.getByRole('button', { name: /^Start counting/ }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(switcher).toHaveAttribute('data-stage', stage);
}

export async function closeProject(page: Page) {
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Close project' }).click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
}

/** Opens Settings › Project and applies a change to the client field. */
export async function setClient(page: Page, client: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('tab', { name: 'Project' }).click();
  await dialog.getByLabel('Client').fill(client);
  await dialog.getByRole('button', { name: 'Apply changes' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

/** Imports fixture files through the "Import drawings" button and its file chooser. */
export async function importDrawings(page: Page, files: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import drawings' }).first().click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(
    files.map((f) => new URL(`./fixtures/${f}`, import.meta.url).pathname),
  );
}

export async function openMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** A point in drawing coordinates on the screen, through the viewer's current transform. */
export async function toScreen(page: Page, x: number, y: number) {
  const overlay = page.getByTestId('viewer-overlay');
  const box = (await overlay.boundingBox())!;
  const transform = (await overlay.locator('g').first().getAttribute('transform'))!;
  const [a, b, c, d, e, f] = transform.match(/-?[\d.]+(e-?\d+)?/g)!.map(Number) as number[];
  return { x: box.x + a! * x + c! * y + e!, y: box.y + b! * x + d! * y + f! };
}

/** Clicks a point given in drawing coordinates. */
export async function clickDrawing(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  await page.mouse.click(point.x, point.y);
}
