/**
 * Automatic identification and line sizes (roadmap #59, #60, CNT-01): Identify
 * finds every kind of counted symbol on a drawing, from examples on it or on
 * other drawings, and each suggestion takes the size of its line from the line
 * numbers; one whose line size cannot be read is left pending for the user.
 * Fill sizes does the same for items counted by hand without a size.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickDrawing } from './helpers';

interface Shown {
  x: number;
  y: number;
  size: string;
  value: string | null;
}

async function suggestions(page: Page): Promise<Shown[]> {
  return page.getByTestId('suggestion').evaluateAll((els) =>
    els.map((el) => ({
      x: Number(el.dataset.cx),
      y: Number(el.dataset.cy),
      size: el.dataset.size ?? '',
      value: el.dataset.sizeValue ?? null,
    })),
  );
}

const near = (p: { x: number; y: number }, x: number, y: number) =>
  Math.abs(p.x - x) <= 4 && Math.abs(p.y - y) <= 4;

async function openSample(page: Page, sheet: string) {
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await page.getByTestId('drawing-list').getByText(sheet).click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
}

async function uncount(page: Page, points: readonly (readonly [number, number])[]) {
  for (const [x, y] of points) {
    await clickDrawing(page, x, y);
    await expect(page.getByTestId('marker-inspector')).toBeVisible();
    await page.getByRole('application').focus();
    await page.keyboard.press('Delete');
  }
}

/** Waits for the search and the line sizes of every suggestion. */
async function identify(page: Page) {
  await page.getByTestId('identify-equipment').click();
  const bar = page.getByTestId('suggestion-bar');
  await expect(bar).toHaveAttribute('data-mode', 'identify');
  await expect(bar.getByTestId('suggestion-status')).toHaveText(/^1 of \d+$/, { timeout: 30_000 });
  await expect(page.locator('[data-testid="suggestion"][data-size="reading"]')).toHaveCount(0, {
    timeout: 30_000,
  });
  return bar;
}

test('identifies the rest of the equipment and sizes it from the line numbers', async ({ app }) => {
  const dir = `line-sizes-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await openSample(page, 'PEFS-S-001');
  const markers = page.getByTestId('marker');
  await expect(markers).toHaveCount(17);

  // Uncount HV-102 and flange F-3 on the 6" gas line, HV-104 on the 4" line,
  // and HV-105 on the separator drain, which has no line number.
  await uncount(page, [
    [790, 150],
    [850, 150],
    [640, 560],
    [620, 420],
  ]);
  await expect(markers).toHaveCount(13);

  const started = Date.now();
  const bar = await identify(page);
  test
    .info()
    .annotations.push({ type: 'identify time (ms)', description: `${Date.now() - started}` });
  const found = await suggestions(page);
  test.info().annotations.push({ type: 'suggestions', description: JSON.stringify(found) });
  expect(found).toHaveLength(4);
  const at = (x: number, y: number) => found.find((p) => near(p, x, y));
  expect(at(790, 150)).toMatchObject({ size: 'found', value: '6"' });
  expect(at(850, 150)).toMatchObject({ size: 'found', value: '6"' });
  expect(at(640, 560)).toMatchObject({ size: 'found', value: '4"' });
  expect(at(620, 420)).toMatchObject({ size: 'none', value: null });

  // The bar names each one's type and size, and the label it was read from is marked.
  await expect(bar.getByTestId('suggestion-kind')).toHaveText(/Flange|Valve/);
  await expect(page.getByTestId('suggestion-size-source').first()).toHaveAttribute(
    'data-text',
    /"-[GP]-100[23]-A1$/,
  );

  // Accept all four as one step: three sized, one pending.
  await bar.getByRole('button', { name: 'Accept all 4' }).click();
  await expect(markers).toHaveCount(17);
  await expect(page.getByText('Sizes: 3 read from line numbers, 1 pending')).toBeVisible();
  const inspector = page.getByTestId('marker-inspector');
  const size = inspector.getByLabel('Size', { exact: true });
  await clickDrawing(page, 850, 150);
  await expect(inspector).toContainText('Flange');
  await expect(size).toHaveValue('6"');
  await clickDrawing(page, 640, 560);
  await expect(inspector).toContainText('Valve');
  await expect(size).toHaveValue('4"');
  await clickDrawing(page, 620, 420);
  await expect(size).toHaveValue('');
  await expect(inspector).toContainText('Incomplete item');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(markers).toHaveCount(13);
  await app.removeDirectory(dir);
});

test('fills missing sizes, and identifies from examples on another drawing', async ({ app }) => {
  const dir = `line-sizes-fill-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await openSample(page, 'PEFS-S-002');
  const inspector = page.getByTestId('marker-inspector');
  const size = inspector.getByLabel('Size', { exact: true });

  // Flange F-4 was counted with no size: Fill sizes reads it from 6"-G-1002-A1.
  const fill = page.getByTestId('fill-sizes');
  await expect(fill).toContainText('1');
  await fill.click();
  await expect(page.getByText('Size filled for 1 item from the line numbers (6").')).toBeVisible({
    timeout: 30_000,
  });
  await expect(fill).toBeDisabled();
  await clickDrawing(page, 290, 300);
  await expect(size).toHaveValue('6"');

  // F-4 is the only flange on this sheet. Uncounted, Identify finds it with
  // the flanges counted on PEFS-S-001.
  await page.getByRole('application').focus();
  await page.keyboard.press('Delete');
  const bar = await identify(page);
  const flange = (await suggestions(page)).find((p) => near(p, 290, 300));
  expect(flange).toMatchObject({ size: 'found', value: '6"' });
  while ((await page.getByTestId('suggestion').count()) > 0) {
    const current = await page
      .locator('[data-testid="suggestion"][data-current="true"]')
      .evaluate((el) => ({ x: Number(el.dataset.cx), y: Number(el.dataset.cy) }));
    const accept = near(current, 290, 300);
    if (accept) await expect(bar.getByTestId('suggestion-kind')).toHaveText('Flange');
    await bar.getByRole('button', { name: accept ? 'Accept' : 'Reject', exact: true }).click();
  }
  await clickDrawing(page, 290, 300);
  await expect(inspector).toContainText('Flange');
  await expect(size).toHaveValue('6"');
  await app.removeDirectory(dir);
});
