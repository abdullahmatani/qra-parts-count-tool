import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { createProject, importDrawings } from './helpers';

const DWG_FIXTURE = 'PEFS-4001.dwg';
const hasDwgFixture = existsSync(new URL(`./fixtures/${DWG_FIXTURE}`, import.meta.url));

test.describe('CAD drawings (DRW-02, DRW-10)', () => {
  test('imports a DXF, reads its title block, renders it and caches the display list', async ({
    app,
  }) => {
    const dir = `cad-dxf-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'CAD study' });
    const page = app.page;

    await importDrawings(page, ['PEFS-4001.dxf']);
    const picker = page.getByRole('dialog', { name: 'Choose drawings to import' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('checkbox', { name: 'Model space' })).toBeChecked();
    await picker.getByRole('button', { name: 'Import 1 drawing' }).click();

    await expect(page.getByText('Imported 1 drawing from 1 file.')).toBeVisible();
    await expect(page.getByTestId('drawing-list').getByText('PEFS-4001 / 1')).toBeVisible();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    // At fit zoom the preview is sharp enough; zooming in triggers the full-resolution render.
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('viewer-detail-layer')).toHaveAttribute('data-rendered', 'true', {
      timeout: 15_000,
    });

    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json'));
    const drawing = saved.drawings[0];
    expect(drawing).toMatchObject({
      fileType: 'dxf',
      layout: 'Model',
      drawingNo: 'PEFS-4001',
      title: 'GAS COMPRESSOR SUCTION DRUM',
      revision: 'B',
      sheet: '1',
    });
    // A1 sheet in millimetres, plus the 2 % margin on each side.
    expect(drawing.size.width).toBeGreaterThan(2384);
    expect(drawing.size.width).toBeLessThan(2600);
    expect(await app.list(dir, `cache/cad/${drawing.fileHash}`)).toHaveLength(1);

    // The DXF reader worker is served with the worker CSP: no other origin, eval allowed.
    const workerUrl = await page.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .find((name) => name.includes('/workers/dxf.worker')) ?? null,
    );
    expect(workerUrl).not.toBeNull();
    if (!test.info().project.name.includes('offline')) {
      const response = await page.request.get(workerUrl!);
      const csp = response.headers()['content-security-policy'] ?? '';
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("'unsafe-eval'");
      expect(csp).not.toMatch(/https?:/);
    }
    await app.removeDirectory(dir);
  });

  test('imports a native DWG through the LibreDWG worker', async ({ app }) => {
    test.skip(
      !hasDwgFixture,
      `e2e/fixtures/${DWG_FIXTURE} missing (see scripts/generate-cad-fixtures.mjs)`,
    );
    const dir = `cad-dwg-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'DWG study' });
    const page = app.page;

    await importDrawings(page, [DWG_FIXTURE]);
    const picker = page.getByRole('dialog', { name: 'Choose drawings to import' });
    await picker.getByRole('button', { name: /Import 1 drawing/ }).click();
    await expect(page.getByTestId('drawing-list').getByText('PEFS-4001 / 1')).toBeVisible({
      timeout: 30_000,
    });
    // At fit zoom the preview is sharp enough; zooming in triggers the full-resolution render.
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('viewer-detail-layer')).toHaveAttribute('data-rendered', 'true', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await expect
      .poll(async () => JSON.parse(await app.readText(dir, 'project.qrapc.json')).drawings[0])
      .toMatchObject({ fileType: 'dwg', layout: 'Model', drawingNo: 'PEFS-4001', revision: 'B' });
    await app.removeDirectory(dir);
  });

  test('imports several native DWG files at once', async ({ app }) => {
    test.skip(
      !hasDwgFixture,
      `e2e/fixtures/${DWG_FIXTURE} missing (see scripts/generate-cad-fixtures.mjs)`,
    );
    const dir = `cad-dwg-bulk-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'DWG bulk study' });
    const page = app.page;

    // Three different files: trailing bytes change the content, not the drawing.
    const dwg = readFileSync(new URL(`./fixtures/${DWG_FIXTURE}`, import.meta.url));
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import drawings' }).first().click();
    await (
      await chooser
    ).setFiles(
      ['PEFS-4001.dwg', 'PEFS-4002.dwg', 'PEFS-4003.dwg'].map((name, i) => ({
        name,
        mimeType: 'application/octet-stream',
        buffer: Buffer.concat([dwg, Buffer.alloc(i)]),
      })),
    );
    const picker = page.getByRole('dialog', { name: 'Choose drawings to import' });
    await picker.getByRole('button', { name: 'Import 3 drawings' }).click();
    await expect(page.getByText('Imported 3 drawings from 3 file(s).')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('drawing-list').locator('li[data-drawing-id]')).toHaveCount(3);
    expect(await app.list(dir, 'drawings')).toEqual([
      'PEFS-4001.dwg',
      'PEFS-4002.dwg',
      'PEFS-4003.dwg',
    ]);
    await app.removeDirectory(dir);
  });
});
