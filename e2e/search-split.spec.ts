/**
 * Text search and split view (roadmap #53) on the sample project: find tags
 * on a drawing and across drawings (DRW-08), and two drawings side by side
 * (DRW-06).
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';

async function openSample(app: AppFixture, name: string) {
  const dir = `${name}-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  return { dir, page };
}

async function openSheet(page: Page, drawingNo: string) {
  await page.getByTestId('drawing-list').getByText(drawingNo).click();
  await expect(page.getByTestId('viewer-preview-layer').first()).toBeVisible();
}

const zoomOf = async (page: Page) =>
  Number(await page.getByTestId('drawing-viewer').first().getAttribute('data-zoom'));

test('finds tags on a drawing and across drawings (DRW-08)', async ({ app }) => {
  const { dir, page } = await openSample(app, 'search');
  await openSheet(page, 'PEFS-S-001');
  await page.getByRole('application').focus();
  await page.keyboard.press('Control+f');
  const bar = page.getByTestId('find-bar');
  const input = bar.getByLabel('Find text on the drawing');
  await expect(input).toBeFocused();

  // "hv 10" matches HV-101 … HV-105, ignoring the space and the dash.
  await input.fill('hv 10');
  await expect(bar.getByTestId('find-status')).toHaveText('1 of 5');
  await expect(page.getByTestId('search-hit')).toHaveCount(5);
  const before = await zoomOf(page);
  await input.press('Enter');
  await expect(bar.getByTestId('find-status')).toHaveText('2 of 5');
  await expect(page.locator('[data-testid="search-hit"][data-current="true"]')).toHaveCount(1);
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(before);

  // Across all drawings: the ESDVs are on both sheets.
  await input.fill('ESDV');
  await bar.getByRole('button', { name: 'Search all drawings' }).click();
  const results = bar.getByTestId('find-results');
  await expect(results).toContainText('Found on 2 drawings');
  await expect(results.getByRole('button')).toHaveText([
    /PEFS-S-001.*3 matches/,
    /PEFS-S-002.*1 match/,
  ]);
  await results.getByRole('button', { name: /PEFS-S-002/ }).click();
  await expect(page.getByRole('tab', { name: 'PEFS-S-002' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(bar.getByTestId('find-status')).toHaveText('1 of 1');

  await input.press('Escape');
  await expect(bar).toBeHidden();
  await expect(page.getByTestId('search-hit')).toHaveCount(0);
  await app.removeDirectory(dir);
});

test('shows two drawings side by side (DRW-06)', async ({ app }) => {
  const { dir, page } = await openSample(app, 'split');
  await openSheet(page, 'PEFS-S-001');
  const split = page.getByRole('button', { name: 'Split view: two drawings side by side' });
  // One open drawing: nothing to put beside it yet.
  await expect(split).toBeDisabled();
  await openSheet(page, 'PEFS-S-002');
  await split.click();
  await expect(split).toHaveAttribute('aria-pressed', 'true');

  const left = page.getByTestId('pane-left');
  const right = page.getByTestId('pane-right');
  await expect(left.getByTestId('drawing-viewer')).toHaveAttribute('data-drawing-id', /.+/);
  await expect(left.getByTestId('marker')).toHaveCount(6); // PEFS-S-002
  await expect(right.getByTestId('marker')).toHaveCount(17); // PEFS-S-001
  await expect(left).toHaveAttribute('data-focused', 'true');

  // Working in the right pane makes it the active drawing.
  const box = (await right.getByRole('application').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
  await expect(right).toHaveAttribute('data-focused', 'true');
  await expect(page.getByRole('tab', { name: 'PEFS-S-001' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // A tab opens in the pane in use; the other pane keeps its drawing.
  await page.getByRole('tab', { name: 'PEFS-S-002' }).click();
  await expect(left).toHaveAttribute('data-focused', 'true');

  await split.click();
  await expect(page.getByTestId('pane-left')).toHaveCount(0);
  await expect(page.getByTestId('drawing-viewer')).toHaveCount(1);
  await app.removeDirectory(dir);
});
