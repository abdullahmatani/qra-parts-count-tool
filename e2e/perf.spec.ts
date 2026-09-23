/**
 * Performance tests (roadmap #15): NFR-02 — an A1 drawing opens in under 3 s.
 * Uses heavy synthetic A1 sheets (about 9,600 symbols with tags) generated into
 * .cache/perf/. Timings are written to the test report and to the console; the
 * reference results are in docs/performance.md.
 */
import { expect, test } from './fixtures';
import { createProject } from './helpers';
import { openSeeded, seedProject } from './seed';
import { ensurePerfFixtures } from '../scripts/perf-fixtures.mjs';

const NFR02_MS = 3000;

test.describe('performance (NFR-02)', () => {
  // Runs in its own Playwright project, alone, after the functional tests.
  test.setTimeout(120_000);

  test('opens a dense A1 PDF drawing in under 3 s', async ({ app }, testInfo) => {
    const { pdf } = await ensurePerfFixtures();
    const dir = 'perf-pdf';
    await app.open();
    await seedProject(app, dir, [
      { file: 'PEFS-A1-heavy.pdf', source: pdf, drawingNo: 'PEFS-9999', width: 2384, height: 1684 },
    ]);
    await openSeeded(app, dir);
    const page = app.page;

    const started = await page.evaluate(() => performance.now());
    await page.getByTestId('drawing-list').getByText('PEFS-9999').click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    const shown = await page.evaluate(() => performance.now());

    // Zoom to 400 % around the centre: time to the sharp render of the visible area.
    await page.getByTestId('viewer-zoom').click();
    await page.getByRole('application').focus();
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('+');
    const zoomed = await page.evaluate(() => performance.now());
    await expect(page.getByTestId('viewer-detail-layer')).toHaveAttribute('data-rendered', 'true');
    const sharp = await page.evaluate(() => performance.now());

    // Close the tab and reopen: the preview now comes from cache/previews.
    await page.getByRole('button', { name: /^Close PEFS-9999/ }).click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeHidden();
    const reopenStart = await page.evaluate(() => performance.now());
    await page.getByTestId('drawing-list').getByText('PEFS-9999').click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    const reopened = await page.evaluate(() => performance.now());

    const result = {
      openMs: Math.round(shown - started),
      sharpAt400Ms: Math.round(sharp - zoomed),
      reopenMs: Math.round(reopened - reopenStart),
    };
    console.log('perf pdf', JSON.stringify(result));
    await testInfo.attach('perf-pdf.json', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    });
    expect(result.openMs).toBeLessThan(NFR02_MS);
    expect(result.reopenMs).toBeLessThan(NFR02_MS);
    await app.removeDirectory(dir);
  });

  test('imports and opens a dense A1 DXF drawing, then reopens it from the cache', async ({
    app,
  }, testInfo) => {
    const { dxf } = await ensurePerfFixtures();
    const dir = 'perf-dxf';
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Perf DXF' });
    const page = app.page;

    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import drawings' }).first().click();
    await (await chooser).setFiles(dxf.pathname);
    const picker = page.getByRole('dialog', { name: 'Choose drawings to import' });
    await expect(picker).toBeVisible({ timeout: 60_000 });
    const importStart = await page.evaluate(() => performance.now());
    await picker.getByRole('button', { name: /Import 1 drawing/ }).click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible({ timeout: 60_000 });
    const firstShown = await page.evaluate(() => performance.now());

    // Close the tab and reopen: now served from cache/cad.
    await page.getByRole('button', { name: /^Close PEFS-9998/ }).click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeHidden();
    const reopenStart = await page.evaluate(() => performance.now());
    await page.getByTestId('drawing-list').getByText('PEFS-9998').click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    const reopened = await page.evaluate(() => performance.now());

    const result = {
      importAndFirstOpenMs: Math.round(firstShown - importStart),
      reopenFromCacheMs: Math.round(reopened - reopenStart),
    };
    console.log('perf dxf', JSON.stringify(result));
    await testInfo.attach('perf-dxf.json', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    });
    expect(result.reopenFromCacheMs).toBeLessThan(NFR02_MS);
    await app.removeDirectory(dir);
  });
});
