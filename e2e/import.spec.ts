import { expect, test } from './fixtures';
import { createProject, importDrawings, openMenu } from './helpers';

test.describe('drawing import and register (DRW-01, DRW-03, DRW-04)', () => {
  test('imports PDFs, one drawing per page, with title-block metadata', async ({ app }) => {
    const dir = `import-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Import study' });
    const page = app.page;

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
    const title = register.getByLabel('Title PEFS-2002 / 2');
    await expect(title).toHaveValue('COMPRESSION TRAIN STAGE 2');
    await title.fill('2ND STAGE COMPRESSOR K-200');
    await title.press('Enter');
    await register.getByLabel('Rev PEFS-2002 / 2').fill('C');
    await register.getByLabel('Rev PEFS-2002 / 2').press('Tab');

    await expect
      .poll(async () => {
        const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json'));
        const d = saved.drawings.find((x: { page: number }) => x.page === 2);
        // Until the edit is saved, the file may not hold the drawing yet.
        return `${d?.title}|${d?.revision}`;
      })
      .toBe('2ND STAGE COMPRESSOR K-200|C');

    await register.getByRole('button', { name: 'Delete PEFS-2003 / 3' }).click();
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
