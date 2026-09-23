/**
 * Performance tests: NFR-02 — an A1 drawing opens in under 3 s (roadmap #15);
 * NFR-03 — pan and zoom stay smooth with 2,000 markers (roadmap #19);
 * NFR-04/05/06 — a 300-drawing, 150-segment, 50,000-item project opens, saves
 * within the 2 s autosave window and exports to Excel in under 30 s (#44, #45).
 * Uses heavy synthetic A1 sheets (about 9,600 symbols with tags) generated into
 * .cache/perf/. Timings are written to the test report and to the console; the
 * reference results are in docs/performance.md.
 */
import { expect, test } from './fixtures';
import { createHash } from 'node:crypto';
import { closeProject, createProject, openMenu } from './helpers';
import { fixture, openSeeded, seedProject } from './seed';
import { ensurePerfFixtures } from '../scripts/perf-fixtures.mjs';

const NFR02_MS = 3000;
/**
 * NFR-03 while panning and zooming: 95 % of frames within three display
 * frames (a 20 fps floor), and on average above 30 fps. Frame times are
 * quantised to the 60 Hz display, so 50 ms means "three frames".
 */
const NFR03_P95_MS = 50.5;
const NFR03_MEAN_MS = 33;
/** NFR-05: at most the last 2 s of edits may be lost, so a save must finish well inside that. */
const NFR05_SAVE_MS = 2000;
const NFR06_EXCEL_MS = 30_000;

interface LibraryType {
  id: string;
  category: string;
}

/**
 * NFR-04 scale: 300 drawings, 150 segments (two drawings each) and 50,000
 * sized, typed items, added to a project created through the UI so the
 * starter library ids are real.
 */
function scaleProject(base: Record<string, unknown>, fileHash: string) {
  const types = (base.library as { equipmentTypes: LibraryType[] }).equipmentTypes;
  const byCategory = (c: string) => types.find((t) => t.category === c)!.id;
  const valve = byCategory('valve');
  const flange = byCategory('flange');
  const smallBore = byCategory('smallBore');
  const sizes = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 24];
  const drawings = Array.from({ length: 300 }, (_, i) => ({
    id: `drw_s${i}`,
    fileName: 'PEFS-1001_A1.pdf',
    originalFileName: 'PEFS-1001_A1.pdf',
    fileHash,
    fileType: 'pdf',
    page: 1,
    drawingNo: `PEFS-${2000 + i}`,
    sheet: '1',
    title: 'Scale test sheet',
    revision: 'A',
    size: { width: 2384, height: 1684 },
    importedAt: '2026-09-23T10:00:00.000Z',
  }));
  const segments = Array.from({ length: 150 }, (_, s) => ({
    id: `seg_s${s}`,
    label: `IS-${String(s + 1).padStart(3, '0')}`,
    colour: s + 1,
    fluid: s % 2 ? 'Oil' : 'Gas',
    drawingIds: [`drw_s${2 * s}`, `drw_s${2 * s + 1}`],
  }));
  const markers = [];
  const items = [];
  for (let k = 0; k < 50_000; k += 1) {
    const d = k % 300;
    const slot = Math.floor(k / 300);
    const segmentId = `seg_s${Math.floor(d / 2)}`;
    const id = `mkr_s${k}`;
    markers.push({
      id,
      drawingId: `drw_s${d}`,
      segmentId,
      shape: 'circle',
      geometry: {
        type: 'circle',
        cx: 100 + (slot % 20) * 110,
        cy: 100 + Math.floor(slot / 20) * 170,
        r: 10,
      },
    });
    const kind = k % 4;
    items.push({
      id: `itm_s${k}`,
      seq: k + 1,
      markerId: id,
      segmentId,
      drawingId: `drw_s${d}`,
      equipmentTypeId: kind < 2 ? valve : kind === 2 ? flange : smallBore,
      actuation: kind === 0 ? 'manual' : kind === 1 ? 'automated' : null,
      nominalSize: kind === 3 ? sizes[k % 5] : sizes[k % sizes.length],
      sizeUnit: 'in',
      tag: k % 10 === 0 ? `HV-${100000 + k}` : '',
    });
  }
  return { ...base, drawings, segments, markers, items, nextItemSeq: 50_001 };
}

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
    expect(result.meanFrameMs).toBeLessThan(NFR03_MEAN_MS);
    await app.removeDirectory(dir);
  });

  test('handles 300 drawings, 150 segments and 50,000 items (NFR-04, NFR-05, NFR-06)', async ({
    app,
  }, testInfo) => {
    test.setTimeout(300_000);
    const dir = 'perf-scale';
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Scale study' });
    const page = app.page;
    await closeProject(page);

    const pdf = fixture('PEFS-1001_A1.pdf');
    await app.writeBytes(dir, 'drawings/PEFS-1001_A1.pdf', pdf);
    const base = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Record<
      string,
      unknown
    >;
    const project = scaleProject(base, createHash('sha256').update(pdf).digest('hex'));
    const text = JSON.stringify(project, null, 2);
    await app.writeText(dir, 'project.qrapc.json', text);

    // Open: from the click to the full segment list.
    await app.pickDirectory(dir);
    const openStart = Date.now();
    await page.getByRole('button', { name: /Open project/ }).click();
    const segmentList = page.getByTestId('segment-list');
    await expect(segmentList.getByRole('button', { name: /IS-150/ })).toBeAttached({
      timeout: 60_000,
    });
    const openMs = Date.now() - openStart;

    // Switch segment: the count table shows its totals.
    const switchStart = Date.now();
    await segmentList.getByRole('button', { name: /IS-075/ }).click();
    await expect(page.getByTestId('segment-drawings')).toContainText('PEFS-2148');
    await expect(page.getByTestId('count-table')).toBeVisible();
    const segmentSwitchMs = Date.now() - switchStart;

    // An edit is on disk within the autosave window (NFR-05 at scale).
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('tab', { name: 'Project' }).click();
    await settings.getByLabel('Client').fill('Scale client');
    // Timed in the page: from the click to the save status turning "saved" again.
    await page.evaluate(() => {
      const status = document.querySelector('[data-testid="save-status"]')!;
      const w = window as unknown as { __savedAt: number | null; __busy: boolean };
      w.__savedAt = null;
      w.__busy = false;
      new MutationObserver(() => {
        const value = status.getAttribute('data-status');
        if (value !== 'saved') w.__busy = true;
        else if (w.__busy && w.__savedAt === null) w.__savedAt = performance.now();
      }).observe(status, { attributes: true, attributeFilter: ['data-status'] });
    });
    const editAt = await page.evaluate(() => performance.now());
    await settings.getByRole('button', { name: 'Apply changes' }).click();
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __savedAt: number | null }).__savedAt),
        {
          timeout: 30_000,
        },
      )
      .not.toBeNull();
    const savedAt = await page.evaluate(
      () => (window as unknown as { __savedAt: number }).__savedAt,
    );
    const editToDiskMs = Math.round(savedAt - editAt);
    expect(await app.readText(dir, 'project.qrapc.json')).toContain('Scale client');
    await page.keyboard.press('Escape');

    // Map the client template (sheet per segment) and export Excel (NFR-06).
    await openMenu(page, 'Template mapper');
    const mapper = page.getByRole('dialog', { name: 'Template mapper' });
    await mapper
      .getByTestId('template-file-input')
      .setInputFiles(new URL('./fixtures/Client_template.xlsx', import.meta.url).pathname);
    await expect(mapper.getByTestId('template-name')).toHaveText('Client_template.xlsx');
    const label = mapper.getByLabel('Segment label');
    await label.fill('B3');
    await label.press('Enter');
    await mapper.getByRole('tab', { name: 'Counts' }).click();
    const autoFill = mapper.getByLabel('Fill the count block from');
    await autoFill.fill('C14');
    await autoFill.press('Enter');
    await mapper.getByRole('button', { name: 'Fill', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const exportDialog = page.getByRole('dialog', { name: 'Export' });
    await exportDialog.getByLabel('Annotated drawings (PDF)').uncheck();
    const exportStart = Date.now();
    await exportDialog.getByRole('button', { name: /^Export( anyway)?$/ }).click();
    await expect(exportDialog.getByTestId('export-result')).toContainText(
      'Scale study_PartsCount.xlsx',
      { timeout: 120_000 },
    );
    const excelExportMs = Date.now() - exportStart;

    const result = {
      projectFileMB: Math.round(text.length / 1e5) / 10,
      openMs,
      segmentSwitchMs,
      editToDiskMs,
      excelExportMs,
    };
    console.log('perf scale', JSON.stringify(result));
    await testInfo.attach('perf-scale.json', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    });
    expect(editToDiskMs).toBeLessThan(NFR05_SAVE_MS);
    expect(excelExportMs).toBeLessThan(NFR06_EXCEL_MS);
    await app.removeDirectory(dir);
  });
});
