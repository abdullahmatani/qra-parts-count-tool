/**
 * Assisted counting (roadmap #59, #60): find symbols like a counted one on the
 * sample drawing, review the suggestions, and accept or reject each; nothing
 * is counted until accepted.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickDrawing, createProject, importDrawings, toScreen } from './helpers';

async function suggestionCentres(page: Page): Promise<{ x: number; y: number }[]> {
  return page
    .getByTestId('suggestion')
    .evaluateAll((els) =>
      els.map((el) => ({ x: Number(el.dataset.cx), y: Number(el.dataset.cy) })),
    );
}

const near = (points: { x: number; y: number }[], x: number, y: number) =>
  points.some((p) => Math.abs(p.x - x) <= 4 && Math.abs(p.y - y) <= 4);

test('suggests symbols like a counted one for review (roadmap #59, #60)', async ({ app }) => {
  const dir = `assist-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await page.getByTestId('drawing-list').getByText('PEFS-S-001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  const markers = page.getByTestId('marker');
  await expect(markers).toHaveCount(17);

  // Uncount two gate valves: HV-104 on a horizontal line, HV-105 on a vertical drain.
  for (const [x, y] of [
    [640, 560],
    [620, 420],
  ] as const) {
    await clickDrawing(page, x, y);
    await expect(page.getByTestId('marker-inspector')).toBeVisible();
    await page.getByRole('application').focus();
    await page.keyboard.press('Delete');
  }
  await expect(markers).toHaveCount(15);

  // Use HV-101 as the example.
  await clickDrawing(page, 280, 300);
  const inspector = page.getByTestId('marker-inspector');
  await expect(inspector).toContainText('Valve');
  const started = Date.now();
  await inspector.getByRole('button', { name: 'Find similar symbols' }).click();
  const bar = page.getByTestId('suggestion-bar');
  const status = bar.getByTestId('suggestion-status');
  await expect(status).toHaveText(/^1 of \d+$/, { timeout: 20_000 });
  test
    .info()
    .annotations.push({ type: 'search time (ms)', description: `${Date.now() - started}` });

  // Both uncounted valves are suggested; symbols already ringed are not.
  const centres = await suggestionCentres(page);
  test.info().annotations.push({ type: 'suggestions', description: JSON.stringify(centres) });
  expect(near(centres, 640, 560)).toBe(true);
  expect(near(centres, 620, 420)).toBe(true);
  expect(near(centres, 280, 300)).toBe(false);
  expect(near(centres, 790, 150)).toBe(false);
  // Suggestions are not markers until accepted.
  await expect(markers).toHaveCount(15);

  // Step through, reject one, accept one.
  const total = centres.length;
  await bar.getByRole('button', { name: 'Next suggestion' }).click();
  await expect(status).toHaveText(total > 1 ? `2 of ${total}` : `1 of ${total}`);
  await bar.getByRole('button', { name: 'Previous suggestion' }).click();
  await expect(status).toHaveText(`1 of ${total}`);

  // Keep only the two valves by the similarity they share, then accept them one at a time.
  const valves = (await suggestionCentres(page)).filter(
    (p) => near([p], 640, 560) || near([p], 620, 420),
  );
  expect(valves).toHaveLength(2);
  while ((await suggestionCentres(page)).length > 0) {
    const current = await page
      .locator('[data-testid="suggestion"][data-current="true"]')
      .evaluate((el) => ({ x: Number(el.dataset.cx), y: Number(el.dataset.cy) }));
    const isValve = near(valves, current.x, current.y);
    await bar.getByRole('button', { name: isValve ? 'Accept' : 'Reject', exact: true }).click();
  }
  await expect(markers).toHaveCount(17);
  await expect(bar.getByTestId('suggestion-status')).toHaveText(/No similar symbols found/);

  // An accepted suggestion carries the example's item: a manual 8" valve.
  await expect(inspector).toContainText('Valve');
  await expect(inspector.getByLabel('Size', { exact: true })).toHaveValue('8"');

  // Each acceptance is its own undo step.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(markers).toHaveCount(16);
  await bar.getByRole('button', { name: 'Close suggestions' }).click();
  await expect(bar).toBeHidden();
  await app.removeDirectory(dir);
});

test('suggests every other gate valve on a DXF sheet (roadmap #59, #60)', async ({ app }) => {
  const dir = `assist-cad-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await createProject(page, { name: 'Assisted CAD count' });
  await importDrawings(page, ['PEFS-4001.dxf']);
  const picker = page.getByRole('dialog', { name: 'Choose drawings to import' });
  await picker.getByRole('button', { name: 'Import 1 drawing' }).click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();

  // Ring the first gate valve (a VALVE block at 120, 110 mm) and make it a valve item.
  const mm = 72 / 25.4;
  const at = (x: number, y: number) => [x * mm, (594 - y) * mm] as const;
  const [cx, cy] = at(120, 110);
  const centre = await toScreen(page, cx, cy);
  const edge = await toScreen(page, cx + 17, cy);
  await page.getByRole('application').focus();
  await page.keyboard.press('c');
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y, { steps: 5 });
  await page.mouse.up();
  const editor = page.getByTestId('item-editor');
  await editor.getByRole('combobox', { name: 'Equipment type' }).click();
  await page.getByRole('option', { name: /^Valve/ }).click();
  await page.getByRole('button', { name: 'Find similar symbols' }).click();

  // 23 more valves on the sheet (x = 120 or 450 mm), and nothing else at 80 %.
  const bar = page.getByTestId('suggestion-bar');
  await expect(bar.getByTestId('suggestion-status')).toHaveText(/^1 of \d+$/, { timeout: 30_000 });
  await bar.getByRole('combobox', { name: 'Similarity' }).click();
  await page.getByRole('option', { name: '80% or more' }).click();
  await expect(bar.getByTestId('suggestion-status')).toHaveText('1 of 23');
  const columns = (await suggestionCentres(page)).map((p) => Math.round(p.x / mm));
  expect(columns.every((x) => Math.abs(x - 120) <= 2 || Math.abs(x - 450) <= 2)).toBe(true);

  // Accept all of them in one step.
  const markers = page.getByTestId('marker');
  await bar.getByRole('button', { name: 'Accept all 23' }).click();
  await expect(markers).toHaveCount(24);
  await expect(page.getByTestId('marker-inspector')).toContainText('23 items');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(markers).toHaveCount(1);
  await app.removeDirectory(dir);
});
