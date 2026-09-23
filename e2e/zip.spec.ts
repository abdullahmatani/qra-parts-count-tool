/**
 * The project as one .zip (roadmap #54, PRJ-08, risk R2): export a project,
 * open the .zip into another folder, and open it read-only in a browser that
 * cannot write to folders, with the exports downloaded as a .zip.
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { openMenu } from './helpers';

async function readZipNames(path: string): Promise<string[]> {
  // The central directory lists every entry; enough for these checks.
  const zip = await readFile(path);
  const names: string[] = [];
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i += 1) {
    const length = zip.readUInt16LE(p + 28);
    names.push(zip.subarray(p + 46, p + 46 + length).toString('utf8'));
    p += 46 + length + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return names.sort();
}

test('exports a project as .zip, opens it elsewhere and read-only (PRJ-08)', async ({
  app,
  browser,
}) => {
  const source = `zip-source-${test.info().project.name}`;
  const target = `zip-target-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(source);
  await app.removeDirectory(target);
  await app.pickDirectory(source);
  const page = app.page;
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();

  // Export: everything but caches and backups.
  const downloading = page.waitForEvent('download');
  await openMenu(page, 'Export project as .zip');
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Sample study - inlet separator.qrapc.zip');
  const zipPath = test.info().outputPath('sample.qrapc.zip');
  await download.saveAs(zipPath);
  expect(await readZipNames(zipPath)).toEqual([
    'drawings/PEFS-S-001_002_sample.pdf',
    'project.qrapc.json',
  ]);

  // Open it into another (empty) folder, for editing.
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Close project' }).click();
  await app.pickDirectory(target);
  await page.getByRole('button', { name: /Open a project \.zip/ }).click();
  const dialog = page.getByTestId('open-zip-dialog');
  await dialog.getByTestId('zip-file-input').setInputFiles(zipPath);
  await dialog.getByRole('button', { name: 'Choose an empty folder and open' }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByTestId('segment-list').getByRole('button')).toHaveCount(2);
  await expect(page.getByText('Read-only', { exact: true })).toHaveCount(0);
  expect(await app.list(target, 'drawings')).toEqual(['PEFS-S-001_002_sample.pdf']);

  // A browser without folder access (Firefox, Safari) opens it read-only.
  const context = await browser.newContext();
  const readOnly = await context.newPage();
  await readOnly.addInitScript(() => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await readOnly.goto(page.url());
  await expect(readOnly.getByText(/cannot write to local folders/)).toBeVisible();
  await readOnly.getByRole('button', { name: /Open a project \.zip \(read-only\)/ }).click();
  const zipDialog = readOnly.getByTestId('open-zip-dialog');
  await zipDialog.getByTestId('zip-file-input').setInputFiles(zipPath);
  await zipDialog.getByRole('button', { name: 'Open read-only' }).click();
  await expect(readOnly.getByTestId('workspace')).toBeVisible();
  await expect(readOnly.getByText('Read-only', { exact: true })).toBeVisible();
  await readOnly.getByTestId('drawing-list').getByText('PEFS-S-001').click();
  await expect(readOnly.getByTestId('viewer-preview-layer')).toBeVisible();
  await expect(readOnly.getByTestId('marker')).toHaveCount(17);

  // Exports run in memory and come back as a download.
  await readOnly.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = readOnly.getByRole('dialog', { name: 'Export' });
  await exportDialog.getByLabel('Annotated drawings (PDF)').uncheck();
  await exportDialog.getByRole('button', { name: /^Export( anyway)?$/ }).click();
  await expect(exportDialog.getByTestId('export-result')).toContainText(
    'Sample study - inlet separator_PartsCount.xlsx',
    { timeout: 30_000 },
  );
  const exportsDownload = readOnly.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Download exports (.zip)' }).click();
  const exportsPath = test.info().outputPath('exports.zip');
  await (await exportsDownload).saveAs(exportsPath);
  expect(await readZipNames(exportsPath)).toEqual([
    'Sample study - inlet separator_PartsCount.xlsx',
    'export_log.json',
  ]);
  await context.close();

  await app.removeDirectory(source);
  await app.removeDirectory(target);
});
