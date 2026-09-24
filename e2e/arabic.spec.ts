/**
 * Arabic interface and right-to-left layout (roadmap #58, NFR-08): the whole
 * interface switches language and direction, the drawings stay left to right,
 * and exported files are still written in English.
 */
import ExcelJS from 'exceljs';
import { expect, test } from './fixtures';
import { clickDrawing } from './helpers';

test('switches to Arabic, mirrors the layout and exports in English (NFR-08)', async ({ app }) => {
  const dir = `arabic-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('dir', 'ltr');
  const leftPane = page.getByTestId('left-pane');
  const rightPane = page.getByTestId('right-pane');
  expect((await leftPane.boundingBox())!.x).toBeLessThan((await rightPane.boundingBox())!.x);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByLabel('العربية').click();
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('dialog', { name: 'الإعدادات' })).toBeVisible();
  await page.keyboard.press('Escape');

  // The panes are mirrored: drawings and segments on the right.
  await expect(page.getByRole('button', { name: 'تصدير', exact: true })).toBeVisible();
  expect((await leftPane.boundingBox())!.x).toBeGreaterThan((await rightPane.boundingBox())!.x);

  // The drawing itself is still laid out left to right, with every marker.
  await leftPane.getByText('PEFS-S-001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await expect(page.getByRole('application')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('marker')).toHaveCount(17);

  // Size bins read left to right inside Arabic text: 3" < x ≤ 11", not mirrored.
  await clickDrawing(page, 280, 300);
  await expect(page.getByTestId('item-bin')).toHaveText('فئة الحجم: \u20663" < x ≤ 11"\u2069');

  // The language is remembered and applied before the first render.
  await page.reload();
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: /جرّب المشروع النموذجي/ })).toBeVisible();

  // Exported files keep English names, sheets and headings.
  await app.pickDirectory(dir);
  await page
    .getByRole('button', { name: /فتح مشروع/ })
    .first()
    .click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'تصدير' });
  await exportDialog.getByLabel('المخططات المُعلَّقة (PDF)').uncheck();
  await exportDialog.getByLabel('قائمة بنود CSV').check();
  await exportDialog.getByRole('button', { name: /^(تصدير|التصدير على أي حال)$/ }).click();
  const result = exportDialog.getByTestId('export-result');
  await expect(result).toContainText('Sample study - inlet separator_PartsCount.xlsx', {
    timeout: 30_000,
  });
  const [folder] = await app.list(dir, 'exports');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await app.readBytes(dir, `exports/${folder}/Sample study - inlet separator_PartsCount.xlsx`))
      .buffer as ArrayBuffer,
  );
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    'Notes',
    'Item List',
    'Unmapped',
  ]);
  const csv = await app.readText(dir, `exports/${folder}/Sample study - inlet separator_items.csv`);
  expect(csv.split('\n')[0]).toContain('Equipment type');

  // And back to English, left to right.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'الإعدادات' }).click();
  await page.getByRole('dialog', { name: 'الإعدادات' }).getByLabel('English').click();
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await app.removeDirectory(dir);
});
