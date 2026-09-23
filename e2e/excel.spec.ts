/**
 * Excel template mapping and export (roadmap #36–39): upload the client's
 * template, map header fields, counts and notes, export, and check the
 * workbook: values in mapped cells, formatting and formulas kept, the Notes,
 * Item List and Unmapped sheets added, and no drawing links (EXP-02, NTE-03,
 * LNK-04).
 */
import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { createProject, importDrawings, openMenu } from './helpers';

async function start(app: AppFixture) {
  const dir = `excel-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  await createProject(app.page, { name: 'Plant A QRA' });
  const page = app.page;
  await importDrawings(page, ['PEFS-1001_A1.pdf']);
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  return { dir, page };
}

async function newSegment(page: Page, fluid: string) {
  await page.getByTestId('left-pane').getByRole('button', { name: 'Segment' }).click();
  const dialog = page.getByRole('dialog', { name: 'New segment' });
  await dialog.getByLabel('Fluid').fill(fluid);
  await dialog.getByRole('button', { name: 'Create segment' }).click();
  await expect(dialog).toBeHidden();
}

async function logValve(page: Page, fx: number, size: string) {
  const box = (await page.getByRole('application').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * 0.4);
  const input = page.getByLabel('Size', { exact: true });
  await expect(input).toBeFocused();
  await input.fill(size);
  await input.press('Enter');
}

test('maps the client template and exports a filled copy (EXP-02)', async ({ app }) => {
  const { dir, page } = await start(app);

  // Two segments with manual valves; a note on IS-01.
  await newSegment(page, 'Gas');
  await page.getByRole('application').focus();
  await page.keyboard.press('c');
  const box = (await page.getByRole('application').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.4);
  const editor = page.getByTestId('item-editor');
  await editor.getByRole('combobox', { name: 'Equipment type' }).click();
  await page.getByRole('option', { name: /^Valve/ }).click();
  await editor.getByRole('radio', { name: 'Manual' }).click();
  await editor.getByLabel('Size', { exact: true }).fill('2');
  await editor.getByLabel('Size', { exact: true }).press('Enter');
  await logValve(page, 0.3, '1-1/2');
  const notes = page.getByTestId('notes-panel');
  await notes.getByLabel('Add note').fill('**Scope**: inlet to separator');
  await notes.getByRole('button', { name: 'Add note' }).click();
  await newSegment(page, 'Oil');
  await page.getByRole('application').focus();
  await page.keyboard.press('c');
  await logValve(page, 0.6, '8');

  // Template mapper: upload the template and map a few cells.
  await openMenu(page, 'Template mapper');
  const mapper = page.getByRole('dialog', { name: 'Template mapper' });
  await mapper
    .getByTestId('template-file-input')
    .setInputFiles(new URL('./fixtures/Client_template.xlsx', import.meta.url).pathname);
  await expect(mapper.getByTestId('template-name')).toHaveText('Client_template.xlsx');
  await expect(mapper.getByTestId('template-preview')).toContainText('PARTS COUNT');
  const segmentLabel = mapper.getByLabel('Segment label');
  await segmentLabel.click();
  await mapper.locator('[data-cell="B3"]').click();
  await expect(segmentLabel).toHaveValue('B3');
  const fluid = mapper.getByLabel('Fluid', { exact: true });
  await fluid.fill('B4');
  await fluid.press('Enter');
  await mapper.getByRole('tab', { name: 'Counts' }).click();
  const autoFill = mapper.getByLabel('Fill the count block from');
  await autoFill.fill('C14');
  await autoFill.press('Enter');
  await mapper.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(mapper.getByLabel('Valve, manual 1" < x ≤ 2"')).toHaveValue('D15');
  await mapper.getByRole('tab', { name: 'Notes' }).click();
  const notesCell = mapper.getByLabel('Notes cell');
  await notesCell.fill('B40');
  await notesCell.press('Enter');
  await page.keyboard.press('Escape');

  // Export Excel and CSV.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await expect(exportDialog).toContainText('Client_template.xlsx (sheet per segment)');
  await exportDialog.getByLabel('CSV item list').check();
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click();
  const result = exportDialog.getByTestId('export-result');
  await expect(result).toContainText('Plant A QRA_PartsCount.xlsx', { timeout: 30_000 });
  await expect(result).toContainText('Plant A QRA_items.csv');
  await expect(result).toContainText('export_log.json');

  const folders = await app.list(dir, 'exports');
  expect(folders).toHaveLength(1);
  const folder = `exports/${folders[0]}`;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    (await app.readBytes(dir, `${folder}/Plant A QRA_PartsCount.xlsx`)).buffer as ArrayBuffer,
  );
  expect(wb.worksheets.map((s) => s.name)).toEqual([
    'Frequencies',
    'IS-01',
    'IS-02',
    'Notes',
    'Item List',
    'Unmapped',
  ]);
  const is01 = wb.getWorksheet('IS-01')!;
  expect(is01.getCell('B3').value).toBe('IS-01');
  expect(is01.getCell('B3').font?.bold).toBe(true);
  expect(is01.getCell('B4').value).toBe('Gas');
  expect(is01.getCell('D15').value).toBe(2); // manual valves 1"–2"
  expect(is01.getCell('D15').fill).toMatchObject({ fgColor: { argb: 'FFFFF2CC' } });
  expect(is01.getCell('I15').value).toMatchObject({ formula: 'SUM(C15:H15)' });
  expect(String(is01.getCell('B40').value)).toContain('Scope: inlet to separator');
  const is02 = wb.getWorksheet('IS-02')!;
  expect(is02.getCell('B4').value).toBe('Oil');
  expect(is02.getCell('G15').value).toBe(1); // manual valve 6"–11"
  expect(is02.getCell('D15').value).toBe(0);
  expect(wb.getWorksheet('Frequencies')!.getCell('B1').value).toBe('Client scheme 2024');
  expect(wb.getWorksheet('Item List')!.rowCount).toBe(4);
  expect(wb.getWorksheet('Unmapped')!.rowCount).toBe(1);

  const csv = await app.readText(dir, `${folder}/Plant A QRA_items.csv`);
  expect(csv.split('\r\n')[0]).toContain('Item,Segment,Drawing');
  const log = JSON.parse(await app.readText(dir, `${folder}/export_log.json`)) as {
    template: string;
    outputs: string[];
  };
  expect(log.template).toBe('Client_template.xlsx');
  // The template itself is unchanged.
  expect(await app.list(dir, 'templates')).toContain('Client_template.xlsx');
  await app.removeDirectory(dir);
});
