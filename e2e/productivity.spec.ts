/**
 * Productivity features (roadmap #49, #51) on the sample project: bulk edit of
 * items (CNT-10), split, reorder and merge of segments (SEG-07), and export
 * and import of the equipment library (CNT-11).
 */
import { readFile, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { openMenu, setStage } from './helpers';

async function openSample(app: AppFixture) {
  const dir = `productivity-${test.info().project.name}-${test.info().title.slice(0, 12)}`;
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
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await page.getByRole('application').focus();
}

const segmentNames = (page: Page) =>
  page
    .getByTestId('segment-list')
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.textContent?.match(/IS-\d+/)?.[0] ?? ''));

test('bulk edits the size of several items in one step (CNT-10)', async ({ app }) => {
  const { dir, page } = await openSample(app);
  await expect(page.getByTestId('status-warnings')).toHaveText('1 marker with warnings');
  await openSheet(page, 'PEFS-S-002');
  await page.keyboard.press('Control+a');
  const editor = page.getByTestId('bulk-item-editor');
  await expect(page.getByTestId('marker-inspector')).toContainText('5 items');
  await expect(editor.getByLabel('Size', { exact: true })).toHaveAttribute('placeholder', 'Mixed');

  // One size for the valves, the flange and the instrument tap (the filter takes none).
  const size = editor.getByLabel('Size', { exact: true });
  await size.fill('1');
  await size.press('Enter');
  // The flange with no size is complete now.
  await expect(page.getByTestId('status-warnings')).toHaveText('No warnings');
  await expect(size).toHaveValue('1"');

  // One undo step reverts all of them.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('status-warnings')).toHaveText('1 marker with warnings');
  await app.removeDirectory(dir);
});

test('splits, reorders and merges segments (SEG-07)', async ({ app }) => {
  const { dir, page } = await openSample(app);
  // Splitting, reordering and merging are segment set-up.
  await setStage(page, 'segments');
  await openSheet(page, 'PEFS-S-002');
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Split into a new segment' }).click();
  await expect.poll(() => segmentNames(page)).toEqual(['IS-01', 'IS-02', 'IS-03']);
  await expect(page.getByTestId('active-segment-chip')).toHaveText('New markers go to IS-03');
  const inspector = page.getByTestId('marker-inspector');
  await expect(inspector.getByRole('combobox', { name: 'Segment' })).toHaveText(/IS-03/);

  await page.getByRole('button', { name: 'Move IS-03 up the list' }).click();
  await expect.poll(() => segmentNames(page)).toEqual(['IS-01', 'IS-03', 'IS-02']);

  await page.getByRole('button', { name: 'Merge into…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Merge IS-03 into another segment' });
  await dialog.getByRole('combobox', { name: 'Merge into' }).click();
  await page.getByRole('option', { name: 'IS-02' }).click();
  await dialog.getByRole('button', { name: 'Merge' }).click();
  await expect.poll(() => segmentNames(page)).toEqual(['IS-01', 'IS-02']);
  await expect(page.getByTestId('active-segment-chip')).toHaveText('New markers go to IS-02');
  // Defining segments, only set-up warnings count: the sample's open item is for the count.
  await expect(page.getByTestId('status-warnings')).toHaveText('No warnings');
  await app.removeDirectory(dir);
});

test('exports the equipment library and imports it back, merged (CNT-11)', async ({ app }) => {
  const { dir, page } = await openSample(app);
  await openMenu(page, 'Equipment library');
  const dialog = page.getByRole('dialog', { name: 'Equipment library' });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export library' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Sample study - inlet separator.library.json');
  const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    format: string;
    library: { datasetName: string; equipmentTypes: Record<string, unknown>[] };
  };
  expect(file.format).toBe('qrapc-library');

  // Another project's library: a dataset name and one extra type.
  file.library.datasetName = 'IOGP 434-01';
  file.library.equipmentTypes.push({
    ...file.library.equipmentTypes.find((t) => t.category === 'pump'),
    id: 'eqt_turbine',
    name: 'Gas turbine',
    excelKey: 'gasTurbine',
    shortcut: null,
  });
  const edited = test.info().outputPath('client.library.json');
  await writeFile(edited, JSON.stringify(file));
  await dialog.getByTestId('library-file-input').setInputFiles(edited);
  await expect(page.getByText(/Library imported\. Types: 1 added, 18 updated\./)).toBeVisible();
  await expect
    .poll(() =>
      dialog.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)),
    )
    .toContain('Gas turbine');
  await dialog.getByRole('tab', { name: 'Dataset' }).click();
  await expect(dialog.getByLabel('Leak frequency dataset')).toHaveValue('IOGP 434-01');

  // Existing items keep their types: still one warning, no new ones.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('status-warnings')).toHaveText('1 marker with warnings');
  await app.removeDirectory(dir);
});
