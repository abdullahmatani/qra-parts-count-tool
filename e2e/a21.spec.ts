/**
 * The A2.1 parts count sheet (section 7): the template is recognised and
 * mapped in one step, and the export holds one copy of the sheet per
 * segment, named by the segment ID, with only the yellow input cells filled.
 * Uses a synthetic stand-in for the A2.1 workbook (scripts/generate-a21-fixture.mjs).
 */
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { expect, test } from './fixtures';
import { openMenu } from './helpers';

const FIXTURE = new URL('./fixtures/A2.1_parts_count_sheet_synthetic.xlsx', import.meta.url)
  .pathname;

test('maps the A2.1 sheet in one step and exports one sheet per segment', async ({ app }) => {
  const dir = `a21-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();

  await openMenu(page, 'Template mapper');
  const mapper = page.getByRole('dialog', { name: 'Template mapper' });
  await mapper.getByTestId('template-file-input').setInputFiles(FIXTURE);
  await expect(page.getByText('A2.1 mapping applied.')).toBeVisible();
  await expect(mapper.getByTestId('a21-callout')).toBeVisible();
  await expect(mapper.getByLabel('Segment label')).toHaveValue('B4');
  await expect(mapper.getByLabel('Pressure (bara)')).toHaveValue('B9');
  await mapper.getByRole('tab', { name: 'Counts' }).click();
  await expect(mapper.getByLabel('Valve, manual 1" < x ≤ 2"')).toHaveValue('C23');
  await expect(mapper.getByLabel('Pressure vessel All sizes')).toHaveValue('E33');
  await mapper.getByRole('tab', { name: 'Notes' }).click();
  await expect(mapper.getByLabel('Notes, one line per cell')).toHaveValue('B72:B77');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await exportDialog.getByLabel('Annotated drawings (PDF)').uncheck();
  // The sample's open query (a flange without a size) is the only check.
  await expect(exportDialog.getByTestId('check-issue')).toHaveCount(1);
  await exportDialog.getByRole('button', { name: 'Export anyway' }).click();
  await expect(exportDialog.getByTestId('export-result')).toContainText(
    'Sample study - inlet separator_PartsCount.xlsx',
    { timeout: 30_000 },
  );

  const [folder] = await app.list(dir, 'exports');
  const bytes = await app.readBytes(
    dir,
    `exports/${folder}/Sample study - inlet separator_PartsCount.xlsx`,
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  expect(wb.worksheets.map((s) => s.name)).toEqual([
    'IS-01',
    'IS-02',
    'Notes',
    'Item List',
    'Unmapped',
  ]);

  const is01 = wb.getWorksheet('IS-01')!;
  expect(is01.getCell('B4').value).toBe('IS-01');
  expect(is01.getCell('B5').value).toBe('Inlet separator V-100 and its outlets');
  expect(is01.getCell('B6').value).toBe('V-100 inlet separator');
  expect(String(is01.getCell('B7').value)).toContain('PEFS-S-001');
  expect(is01.getCell('B8').value).toBe('101');
  expect(is01.getCell('B9').value).toBe(46.01325); // 45 barg
  expect(is01.getCell('B10').value).toBe(60);
  expect(is01.getCell('B11').value).toBe('Liquid');
  expect(is01.getCell('B12').value).toBe(0.002);
  expect(is01.getCell('B13').value).toBe(720);
  expect(is01.getCell('E33').value).toBe(1); // V-100
  expect(String(is01.getCell('B72').value)).toMatch(/^\[QRA, /);
  // Everything else is the template's: labels, formulas, protection, validation, hidden columns.
  expect(is01.getCell('A4').value).toBe('Isolatable section ID');
  expect(is01.getCell('C2').value).toMatchObject({ formula: 'SUM(N28:N71)' });
  expect(is01.getCell('N33').value).toMatchObject({ formula: '$E33*$H33*I33' });
  expect(is01.getCell('B4').fill).toMatchObject({ fgColor: { argb: 'FFFFFF99' } });
  expect(is01.getColumn('H').hidden).toBe(true);
  expect(is01.getCell('B11').dataValidation).toMatchObject({ type: 'list' });
  expect(is01.getCell('B72').isMerged).toBe(true);
  expect(
    (is01 as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection?.sheet,
  ).toBe(true);

  const is02 = wb.getWorksheet('IS-02')!;
  expect(is02.getCell('B4').value).toBe('IS-02');
  expect(is02.getCell('B9').value).toBe(45.01325);
  expect(is02.getCell('B11').value).toBe('Gas');
  expect(is02.getCell('E33').value).toBe(1); // F-201, a filter vessel
  // Every count has a row in A2.1.
  expect(wb.getWorksheet('Unmapped')!.rowCount).toBe(1);

  // The template in templates/ is the file that was chosen, unchanged.
  const stored = await app.readBytes(dir, 'templates/A2.1_parts_count_sheet_synthetic.xlsx');
  expect(Buffer.from(stored).equals(await readFile(FIXTURE))).toBe(true);
  await app.removeDirectory(dir);
});
