/**
 * Parts count (roadmap #25–31): starter library, item editor on placement,
 * size entry and binning, incomplete items, live count table with highlight,
 * project summary, duplicate tags, library editor and pipe lengths
 * (CNT-01..09, CNT-12).
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { createProject, importDrawings } from './helpers';

async function start(app: AppFixture, name: string) {
  const dir = `count-${name}-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  await createProject(app.page, { name: `Count ${name}` });
  const page = app.page;
  await importDrawings(page, ['PEFS-1001_A1.pdf']);
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  // One segment, active.
  await page.getByTestId('left-pane').getByRole('button', { name: 'Segment' }).click();
  await page.getByRole('button', { name: 'Create segment' }).click();
  await expect(page.getByTestId('active-segment-chip')).toHaveText('New markers go to IS-01');
  return { dir, page };
}

async function clickCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByRole('application').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** Places a circle and logs its size, as a user would: click, type, Enter. */
async function logItem(page: Page, fx: number, fy: number, size: string) {
  await clickCanvas(page, fx, fy);
  const input = page.getByLabel('Size', { exact: true });
  await expect(input).toBeFocused();
  await input.fill(size);
  await input.press('Enter');
  await expect(page.getByRole('application')).toBeFocused();
}

const cell = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('parts count', () => {
  test('logs items with one keystroke each and counts them live (CNT-01..07)', async ({ app }) => {
    const { dir, page } = await start(app, 'live');
    await page.getByRole('application').focus();
    await page.keyboard.press('c');

    // First item: no type yet, so the type field has the focus.
    await clickCanvas(page, 0.2, 0.3);
    const editor = page.getByTestId('item-editor');
    await expect(editor.getByRole('combobox', { name: 'Equipment type' })).toBeFocused();
    await editor.getByRole('combobox', { name: 'Equipment type' }).click();
    await page.getByRole('option', { name: /^Valve/ }).click();
    await editor.getByRole('radio', { name: 'Manual' }).click();
    const size = editor.getByLabel('Size', { exact: true });
    await size.fill('2');
    await expect(page.getByTestId('item-bin')).toHaveText('Bin: 1" < x ≤ 2"');
    await size.press('Enter');

    // Next items reuse the last type and actuation: click, size, Enter.
    await logItem(page, 0.3, 0.3, '1-1/2');
    await logItem(page, 0.4, 0.3, 'DN80');
    await logItem(page, 0.5, 0.3, '12"');

    const table = page.getByTestId('count-table');
    await expect(cell(page, 'Valve, manual 1" < x ≤ 2": 2')).toBeVisible();
    await expect(cell(page, 'Valve, manual 2" < x ≤ 3": 1')).toBeVisible();
    await expect(cell(page, 'Valve, manual > 11": 1')).toBeVisible();

    // A flange via its key (2), and an item left without a size.
    await clickCanvas(page, 0.6, 0.3);
    await page.getByRole('application').focus();
    await page.keyboard.press('2');
    const flangeSize = page.getByLabel('Size', { exact: true });
    await expect(flangeSize).toBeFocused();
    await flangeSize.fill('4');
    await flangeSize.press('Enter');
    await expect(cell(page, 'Flange 3" < x ≤ 11": 1')).toBeVisible();
    await clickCanvas(page, 0.7, 0.3);
    await page.getByLabel('Size', { exact: true }).press('Escape');
    await expect(page.getByTestId('count-incomplete')).toHaveText('1 incomplete item');
    await expect(page.getByTestId('status-warnings')).toHaveText('1 marker with warnings');

    // CNT-06: a cell highlights its markers.
    await cell(page, 'Valve, manual 1" < x ≤ 2": 2').click();
    await expect(page.locator('[data-highlighted="true"]')).toHaveCount(2);
    await page.getByTestId('count-incomplete').click();
    await expect(page.locator('[data-highlighted="true"]')).toHaveCount(1);

    // CNT-07: the project summary has the same layout.
    await table.getByRole('radio', { name: 'All segments' }).click();
    await expect(cell(page, 'Flange 3" < x ≤ 11": 1')).toBeVisible();

    // The totals are saved as items only, never as bins (NFR-09).
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
      timeout: 10_000,
    });
    const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
      items: Record<string, unknown>[];
      library: { equipmentTypes: unknown[] };
    };
    expect(project.items).toHaveLength(6);
    expect(project.items[2]).toMatchObject({
      nominalSize: 80,
      sizeUnit: 'DN',
      actuation: 'manual',
    });
    expect(Object.keys(project.items[0]!)).not.toContain('binId');
    expect(project.library.equipmentTypes.length).toBeGreaterThan(5);
    await app.removeDirectory(dir);
  });

  test('stamp mode repeats the last item on each click (ANN-09)', async ({ app }) => {
    const { dir, page } = await start(app, 'stamp');
    await page.getByRole('application').focus();
    await page.keyboard.press('c');
    await clickCanvas(page, 0.2, 0.3);
    const editor = page.getByTestId('item-editor');
    await editor.getByRole('combobox', { name: 'Equipment type' }).click();
    await page.getByRole('option', { name: /^Valve/ }).click();
    await editor.getByRole('radio', { name: 'Automated' }).click();
    await editor.getByLabel('Size', { exact: true }).fill('3/4');
    await editor.getByLabel('Size', { exact: true }).press('Enter');

    // S: each click logs a copy, with no typing and the drawing keeping the focus.
    await page.keyboard.press('s');
    await expect(page.getByRole('radio', { name: 'Stamp' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    for (const fx of [0.3, 0.4, 0.5]) {
      await clickCanvas(page, fx, 0.3);
      await expect(page.getByRole('application')).toBeFocused();
    }
    await expect(cell(page, 'Valve, automated ≤ 1": 4')).toBeVisible();
    await expect(page.getByTestId('status-warnings')).toHaveText('No warnings');
    await app.removeDirectory(dir);
  });

  test('flags duplicate tags until accepted (CNT-08)', async ({ app }) => {
    const { dir, page } = await start(app, 'dupes');
    await page.getByRole('application').focus();
    await page.keyboard.press('c');
    for (const fx of [0.3, 0.6]) {
      await clickCanvas(page, fx, 0.4);
      await page.keyboard.press('Escape');
      await page.getByRole('application').focus();
      await page.keyboard.press('4'); // Pump: no size needed
      await page.getByLabel('Tag').fill('P-101');
    }
    const duplicates = page.getByTestId('duplicates');
    await expect(duplicates).toContainText('P-101');
    await expect(page.locator('[data-warning="true"]')).toHaveCount(2);
    await duplicates.getByRole('button', { name: 'Accept' }).click();
    await expect(duplicates.getByRole('button', { name: 'Withdraw' })).toBeVisible();
    await expect(page.locator('[data-warning="true"]')).toHaveCount(0);
    await app.removeDirectory(dir);
  });

  test('edits the library and counts pipe lengths when enabled (CNT-02, CNT-04, CNT-12)', async ({
    app,
  }) => {
    const { dir, page } = await start(app, 'library');

    // Library editor: dataset name, bins check, a new type.
    await page.getByRole('button', { name: 'Project', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Equipment library' }).click();
    const library = page.getByRole('dialog', { name: 'Equipment library' });
    await library.getByRole('tab', { name: 'Dataset' }).click();
    const dataset = library.getByLabel('Leak frequency dataset');
    await dataset.fill('IOGP 434-01');
    await dataset.press('Enter');
    await library.getByRole('tab', { name: 'Size bins' }).click();
    await expect(library.getByTestId('bin-problems')).toHaveText(
      'Every size falls in exactly one bin.',
    );
    await library.getByRole('tab', { name: 'Equipment types' }).click();
    await library.getByRole('button', { name: 'Add type' }).click();
    await expect(library.getByTestId('library-type')).toHaveCount(19);
    await page.keyboard.press('Escape');

    // Pipe length counting on (project settings).
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('tab', { name: 'Project' }).click();
    await settings.getByRole('switch', { name: 'Pipe length counting' }).click();
    await settings.getByRole('button', { name: 'Apply changes' }).click();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();

    // A dashed line run gets a pipe item: size and length.
    await page.getByRole('application').focus();
    await page.keyboard.press('d');
    await clickCanvas(page, 0.2, 0.5);
    const box = (await page.getByRole('application').boundingBox())!;
    await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const size = page.getByLabel('Size', { exact: true });
    await expect(size).toBeFocused();
    await size.fill('4');
    await size.press('Enter');
    const length = page.getByLabel('Pipe length (m)');
    await length.fill('12.5');
    await length.press('Enter');
    await expect(page.getByTestId('pipe-lengths')).toContainText('12.5');

    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
      timeout: 10_000,
    });
    const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
      library: { datasetName: string };
      items: { pipeLength: number | null }[];
    };
    expect(project.library.datasetName).toBe('IOGP 434-01');
    expect(project.items[0]!.pipeLength).toBe(12.5);
    await app.removeDirectory(dir);
  });
});
