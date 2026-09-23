/**
 * Performance tests: NFR-02 — an A1 drawing opens in under 3 s (roadmap #15);
 * NFR-03 — pan and zoom stay smooth with 2,000 markers (roadmap #19).
 * Uses heavy synthetic A1 sheets (about 9,600 symbols with tags) generated into
 * .cache/perf/. Timings are written to the test report and to the console; the
 * reference results are in docs/performance.md.
 */
import { expect, test } from './fixtures';
import { createProject } from './helpers';
import { openSeeded, seedProject } from './seed';
import { ensurePerfFixtures } from '../scripts/perf-fixtures.mjs';

const NFR02_MS = 3000;
/** NFR-03: 95th-percentile frame time while panning and zooming (20 fps floor). */
const NFR03_P95_MS = 50;

/** 2,000 markers spread over an A1 sheet, each with a tagged count item. */
function manyMarkers(count: number) {
  const markers = [];
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const id = `mkr_load${i}`;
    const cx = 80 + (i % 50) * 45;
    const cy = 80 + Math.floor(i / 50) * 38;
    markers.push({
      id,
      drawingId: 'drw_seed0',
      segmentId: i % 3 === 0 ? null : 'seg_load',
      shape: i % 10 === 9 ? 'dashedHighlight' : 'circle',
      geometry:
        i % 10 === 9
          ? { type: 'rect', x: cx - 15, y: cy - 10, width: 30, height: 20 }
          : { type: 'circle', cx, cy, r: 10 },
    });
    items.push({
      id: `itm_load${i}`,
      seq: i + 1,
      markerId: id,
      drawingId: 'drw_seed0',
      segmentId: i % 3 === 0 ? null : 'seg_load',
      tag: `HV-${1000 + i}`,
    });
  }
  return {
    segments: [{ id: 'seg_load', label: 'IS-01', colour: 3 }],
    markers,
    items,
    nextItemSeq: count + 1,
  };
}

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

  test('pans and zooms smoothly with 2,000 markers on one drawing (NFR-03)', async ({
    app,
  }, testInfo) => {
    const dir = 'perf-markers';
    await app.open();
    await seedProject(
      app,
      dir,
      [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', width: 2384, height: 1684 }],
      manyMarkers(2000),
    );
    await openSeeded(app, dir);
    const page = app.page;
    await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
    await expect(page.getByTestId('marker')).toHaveCount(2000);

    const surface = page.getByRole('application');
    const box = (await surface.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __recording: boolean };
      w.__frames = [];
      w.__recording = true;
      let last = performance.now();
      const tick = (now: number) => {
        w.__frames.push(now - last);
        last = now;
        if (w.__recording) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Zoom in and out with the wheel, then pan with the middle button.
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, -120);
    for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 120);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + 300, cy + 150, { steps: 30 });
    await page.mouse.move(cx - 200, cy - 100, { steps: 30 });
    await page.mouse.up({ button: 'middle' });
    const frames = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __recording: boolean };
      w.__recording = false;
      return w.__frames.slice(1);
    });
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const mean = frames.reduce((a, b) => a + b, 0) / Math.max(frames.length, 1);
    const result = {
      markers: 2000,
      frames: frames.length,
      meanFrameMs: Math.round(mean * 10) / 10,
      p95FrameMs: Math.round(p95 * 10) / 10,
      maxFrameMs: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
    };
    console.log('perf markers', JSON.stringify(result));
    await testInfo.attach('perf-markers.json', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    });
    expect(result.p95FrameMs).toBeLessThan(NFR03_P95_MS);
    await app.removeDirectory(dir);
  });
});
