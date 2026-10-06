import { expect, test } from './fixtures';
import { createProject, importDrawings, openMenu, setDrawingNamesFromFiles } from './helpers';

test.describe('drawing import and register (DRW-01, DRW-03, DRW-04)', () => {
  test('imports PDFs, one drawing per page, with title-block metadata', async ({ app }) => {
    const dir = `import-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Import study' });
    const page = app.page;
    await setDrawingNamesFromFiles(page, false);

    await importDrawings(page, [
      'PEFS-2000_multipage.pdf',
      'PEFS-1001_A1.pdf',
      'PEFS-3001_rotated.pdf',
    ]);
    await expect(page.getByText('Imported 5 drawings from 3 file(s).')).toBeVisible();
    const list = page.getByTestId('drawing-list');
    for (const name of [
      'PEFS-2001 / 1',
      'PEFS-2002 / 2',
      'PEFS-2003 / 3',
      'PEFS-1001 / 1',
      'PEFS-3001 / 1',
    ]) {
      await expect(list.getByText(name, { exact: true })).toBeVisible();
    }
    // The first imported drawing opens in the viewer.
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();

    // Files are copied into drawings/ and the project records hash, page and metadata.
    expect(await app.list(dir, 'drawings')).toEqual([
      'PEFS-1001_A1.pdf',
      'PEFS-2000_multipage.pdf',
      'PEFS-3001_rotated.pdf',
    ]);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json'));
    const a1 = saved.drawings.find((d: { drawingNo: string }) => d.drawingNo === 'PEFS-1001');
    expect(a1).toMatchObject({
      fileName: 'PEFS-1001_A1.pdf',
      page: 1,
      title: 'INLET SEPARATOR V-100',
      revision: 'C',
      sheet: '1',
      size: { width: 2384, height: 1684 },
    });
    expect(a1.fileHash).toMatch(/^[0-9a-f]{64}$/);
    // A page shown with /Rotate 90: metadata still read, size as displayed.
    const rotated = saved.drawings.find((d: { drawingNo: string }) => d.drawingNo === 'PEFS-3001');
    expect(rotated).toMatchObject({
      title: 'FLARE KO DRUM',
      revision: '0',
      size: { width: 842, height: 1191 },
    });
    expect(
      saved.drawings
        .filter((d: { fileName: string }) => d.fileName === 'PEFS-2000_multipage.pdf')
        .map((d: { page: number }) => d.page),
    ).toEqual([1, 2, 3]);

    // Importing the same content again is skipped.
    await importDrawings(page, ['PEFS-1001_A1.pdf']);
    await expect(page.getByText('No drawings were imported.')).toBeVisible();
    await expect(page.getByText('PEFS-1001_A1.pdf: already in the project.')).toBeVisible();
    await app.removeDirectory(dir);
  });

  test('names drawings after their files by default (Settings › General)', async ({ app }) => {
    const dir = `import-names-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Names study' });
    const page = app.page;

    await importDrawings(page, ['PEFS-2000_multipage.pdf', 'PEFS-1001_A1.pdf']);
    await expect(page.getByText('Imported 4 drawings from 2 file(s).')).toBeVisible();
    const list = page.getByTestId('drawing-list');
    await expect(list.locator('li[data-drawing-id]')).toHaveCount(4);
    for (const name of [
      'PEFS-2000_multipage / 1',
      'PEFS-2000_multipage / 2',
      'PEFS-2000_multipage / 3',
      'PEFS-1001_A1',
    ]) {
      await expect(list.getByText(name, { exact: true })).toBeVisible();
    }
    // The title and revision still come from the title block.
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json'));
    expect(
      saved.drawings.find((d: { fileName: string }) => d.fileName === 'PEFS-1001_A1.pdf'),
    ).toMatchObject({
      drawingNo: 'PEFS-1001_A1',
      sheet: '',
      title: 'INLET SEPARATOR V-100',
      revision: 'C',
    });

    // Switched off, the next import reads names from the title block; earlier ones stay.
    await setDrawingNamesFromFiles(page, false);
    await importDrawings(page, ['PEFS-3001_rotated.pdf']);
    await expect(list.getByText('PEFS-3001 / 1', { exact: true })).toBeVisible();
    await expect(list.getByText('PEFS-1001_A1', { exact: true })).toBeVisible();
    await app.removeDirectory(dir);
  });

  test('edits metadata in the drawing register and removes a drawing', async ({ app }) => {
    const dir = `register-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Register study' });
    const page = app.page;
    await importDrawings(page, ['PEFS-2000_multipage.pdf']);
    await expect(page.getByTestId('drawing-list').locator('li[data-drawing-id]')).toHaveCount(3);

    await openMenu(page, 'Drawing register');
    const register = page.getByTestId('drawing-register');
    await expect(register.locator('tbody tr[data-drawing-id]')).toHaveCount(3);
    const title = register.getByLabel('Title PEFS-2000_multipage / 2');
    await expect(title).toHaveValue('COMPRESSION TRAIN STAGE 2');
    await title.fill('2ND STAGE COMPRESSOR K-200');
    await title.press('Enter');
    await register.getByLabel('Rev PEFS-2000_multipage / 2').fill('C');
    await register.getByLabel('Rev PEFS-2000_multipage / 2').press('Tab');

    await expect
      .poll(async () => {
        const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json'));
        const d = saved.drawings.find((x: { page: number }) => x.page === 2);
        // Until the edit is saved, the file may not hold the drawing yet.
        return `${d?.title}|${d?.revision}`;
      })
      .toBe('2ND STAGE COMPRESSOR K-200|C');

    await register.getByRole('button', { name: 'Delete PEFS-2000_multipage / 3' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete drawing' }).click();
    await expect(register.locator('tbody tr[data-drawing-id]')).toHaveCount(2);
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('drawing-list').locator('li[data-drawing-id]')).toHaveCount(2);

    // Undo brings it back.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('drawing-list').locator('li[data-drawing-id]')).toHaveCount(3);
    await app.removeDirectory(dir);
  });
});

test.describe('drawing import in an older browser (DRW-01)', () => {
  // The service worker would answer the PDF.js worker request, and the test
  // needs to rewrite it.
  test.use({ serviceWorkers: 'block' });

  test('imports and shows a PDF without the newest JavaScript APIs', async ({ app }) => {
    test.skip(test.info().project.name.includes('offline'), 'needs request interception');
    const page = app.page;
    // APIs PDF.js calls that its legacy build does not polyfill, as missing in
    // Chrome or Edge 118: removed in the page and ahead of the PDF.js worker.
    const removeApis = [
      'delete Promise.withResolvers;',
      'delete ReadableStream.prototype[Symbol.asyncIterator];',
      'delete ReadableStream.prototype.values;',
      'delete ArrayBuffer.prototype.transferToFixedLength;',
    ].join('\n');
    await page.addInitScript(removeApis);
    let pdfWorkers = 0;
    await page.route(/\/workers\/pdf\.worker-[\w-]+\.js$/, async (route) => {
      pdfWorkers += 1;
      const response = await route.fetch();
      await route.fulfill({ response, body: `${removeApis}\n${await response.text()}` });
    });

    const dir = `import-older-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(page, { name: 'Older browser study' });
    await importDrawings(page, ['PEFS-1001_A1.pdf']);
    await expect(page.getByText('Imported 1 drawing from 1 file.')).toBeVisible();
    expect(pdfWorkers).toBeGreaterThan(0);

    // The title block text was read, and the page renders at full resolution.
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json'));
    expect(saved.drawings[0]).toMatchObject({ title: 'INLET SEPARATOR V-100', revision: 'C' });
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('viewer-detail-layer')).toHaveAttribute('data-rendered', 'true', {
      timeout: 15_000,
    });
    await app.removeDirectory(dir);
  });
});
