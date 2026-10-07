/**
 * Undo and redo history menus (PRJ-09): the arrow beside Undo or Redo lists
 * the steps with a summary of each; pointing at a step highlights it and the
 * steps above it, greys out the markers they would change and outlines where
 * markers would go back to. Choosing a step undoes or redoes them all.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

const circle = (id: string, cx: number, cy: number) => ({
  id,
  drawingId: 'drw_seed0',
  segmentId: null,
  shape: 'circle',
  geometry: { type: 'circle', cx, cy, r: 16 },
});

/** Page position of a drawing point, from the viewer's current view (0° rotation). */
async function screenOf(page: Page, x: number, y: number) {
  const viewer = page.getByTestId('drawing-viewer');
  const zoom = Number(await viewer.getAttribute('data-zoom'));
  const vx = Number(await viewer.getAttribute('data-center-x'));
  const vy = Number(await viewer.getAttribute('data-center-y'));
  const box = (await page.getByRole('application').boundingBox())!;
  const k = zoom * (96 / 72);
  return { x: box.x + box.width / 2 + (x - vx) * k, y: box.y + box.height / 2 + (y - vy) * k };
}

const marker = (page: Page, id: string) =>
  page.locator(`[data-testid="marker"][data-marker-id="${id}"]`);

test('lists, previews and jumps through the undo and redo history', async ({ app }) => {
  const dir = `history-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', revision: 'C', ...A1 }],
    {
      stage: 'segments',
      markers: [circle('mkr_a', 600, 600), circle('mkr_b', 1000, 600), circle('mkr_c', 1400, 600)],
    },
  );
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await expect(page.getByTestId('marker')).toHaveCount(3);

  // Two steps: delete B, then drag C to the right.
  await page.getByRole('application').focus();
  await page.keyboard.press('v');
  const b = await screenOf(page, 1000, 600);
  await page.mouse.click(b.x, b.y);
  await expect(marker(page, 'mkr_b')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('marker')).toHaveCount(2);
  const c = await screenOf(page, 1400, 600);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y, { steps: 6 });
  await page.mouse.up();

  // The undo history: the most recent step first, each with what it changed.
  await expect(page.getByRole('button', { name: 'Forward history' })).toBeDisabled();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const undoMenu = page.getByTestId('history-menu-undo');
  const steps = undoMenu.getByTestId('history-step');
  await expect(steps).toHaveCount(2);
  await expect(undoMenu.getByTestId('history-step-label')).toHaveText([
    'Move marker',
    'Delete marker',
  ]);
  await expect(steps.nth(0)).toContainText('Changes 1 marker · PEFS-1001');
  await expect(steps.nth(1)).toContainText('Removes 1 marker · PEFS-1001');

  // The step undone next is previewed: C greyed out, its old place outlined.
  await expect(steps.nth(0)).toHaveAttribute('data-in-range', 'true');
  await expect(steps.nth(1)).toHaveAttribute('data-in-range', 'false');
  await expect(marker(page, 'mkr_c')).toHaveAttribute('data-changing', 'true');
  await expect(marker(page, 'mkr_a')).toHaveAttribute('data-changing', 'false');
  await expect(page.getByTestId('history-ghost')).toHaveCount(1);

  // Pointing further down takes in the steps above it; B would come back.
  await steps.nth(1).hover();
  await expect(steps.nth(0)).toHaveAttribute('data-in-range', 'true');
  await expect(steps.nth(1)).toHaveAttribute('data-in-range', 'true');
  await expect(undoMenu.getByRole('status')).toContainText('Undo 2 steps');
  await expect(page.getByTestId('history-ghost')).toHaveCount(2);
  await expect(page.locator('[data-testid="history-ghost"][data-marker-id="mkr_b"]')).toHaveCount(
    1,
  );

  // Choosing it undoes both steps; the preview ends with the menu.
  await steps.nth(1).click();
  await expect(undoMenu).toBeHidden();
  await expect(page.getByTestId('marker')).toHaveCount(3);
  await expect(page.getByTestId('history-ghost')).toHaveCount(0);
  await expect(page.locator('[data-changing="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeDisabled();

  // The forward history: the next redo first. Redoing the delete greys out B.
  await page.getByRole('button', { name: 'Forward history' }).click();
  const redoMenu = page.getByTestId('history-menu-redo');
  await expect(redoMenu.getByTestId('history-step-label')).toHaveText([
    'Delete marker',
    'Move marker',
  ]);
  await expect(marker(page, 'mkr_b')).toHaveAttribute('data-changing', 'true');
  await redoMenu.getByTestId('history-step').first().click();
  await expect(page.getByTestId('marker')).toHaveCount(2);
  await expect(marker(page, 'mkr_b')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();

  // Esc closes a menu without changing anything.
  await page.getByRole('button', { name: 'Forward history' }).click();
  await expect(marker(page, 'mkr_c')).toHaveAttribute('data-changing', 'true');
  await page.keyboard.press('Escape');
  await expect(redoMenu).toBeHidden();
  await expect(marker(page, 'mkr_c')).toHaveAttribute('data-changing', 'false');
  await expect(page.getByTestId('marker')).toHaveCount(2);
  await app.removeDirectory(dir);
});
