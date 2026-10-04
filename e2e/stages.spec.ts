/**
 * The two stages of a study: segments are defined first (highlighting, ESDVs,
 * end flanges, links), then the parts are counted with only the counting
 * tools and panels; the segments' set-up is locked while counting.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

async function clickCanvas(page: Page, x: number, y: number) {
  // Drawing coordinates on the fitted A1 sheet, as fractions of the canvas.
  const box = (await page.getByRole('application').boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('defines segments first, then counts with the segments locked', async ({ app }) => {
  const dir = `stages-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }], {
    segments: [
      {
        id: 'seg_1',
        label: 'IS-01',
        colour: 1,
        fluid: 'Gas',
        drawingIds: ['drw_seed0'],
        boundingEsdvIds: ['mkr_e'],
      },
      // Nothing marked: the check before counting says so.
      { id: 'seg_2', label: 'IS-02', colour: 2 },
    ],
    markers: [
      {
        id: 'mkr_e',
        drawingId: 'drw_seed0',
        shape: 'circle',
        geometry: { type: 'circle', cx: 1192, cy: 842, r: 30 },
        esdv: {
          tag: 'ESDV-7',
          nominalSize: 8,
          sizeUnit: 'in',
          upstreamSegmentId: 'seg_1',
          downstreamSegmentId: null,
          boundaryRuleOverride: null,
        },
      },
    ],
  });
  await openSeeded(app, dir);
  const page = app.page;
  const toolbar = page.getByTestId('toolbar');
  const stages = page.getByTestId('stage-switcher');

  // Segments: the set-up tools and the segment's process data, no counting.
  await expect(stages).toHaveAttribute('data-stage', 'segments');
  await expect(stages.getByRole('radio', { name: /Segments/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  for (const name of ['Highlighter', 'ESDV', 'End flange', 'Drawing link', 'Dashed highlight']) {
    await expect(toolbar.getByRole('radio', { name })).toBeVisible();
  }
  await expect(toolbar.getByRole('radio', { name: 'Circle' })).toHaveCount(0);
  await page.getByTestId('segment-list').getByRole('button', { name: /IS-01/ }).click();
  const details = page.getByTestId('segment-details');
  await expect(details.getByTestId('process-summary')).toHaveText('Gas');
  await details.getByTestId('process-toggle').click();
  await expect(details.getByLabel('Fluid')).toHaveValue('Gas');
  await expect(page.getByRole('region', { name: 'Count table' })).toHaveCount(0);
  await expect(
    page.getByTestId('left-pane').getByRole('button', { name: 'Segment' }),
  ).toBeVisible();

  // A counting tool's key says where it is.
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await page.getByRole('application').focus();
  await page.keyboard.press('c');
  await expect(page.getByText('Circle is used in the parts count.')).toBeVisible();
  await expect(toolbar.getByRole('radio', { name: 'Select' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // The ESDV can be selected and edited while defining segments, and is drawn in full.
  const esdv = page.locator('[data-marker-id="mkr_e"]');
  await expect(esdv).toHaveAttribute('data-dimmed', 'false');
  await clickCanvas(page, 0.5, 0.5);
  await expect(page.getByTestId('marker-inspector')).toContainText('ESDV');
  await page.keyboard.press('Escape');

  // Starting the count checks the segments first.
  await stages.getByRole('radio', { name: /Parts count/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Start the parts count?' });
  await expect(dialog.getByTestId('readiness-issue')).toHaveCount(2);
  await expect(dialog.locator('[data-kind="segmentsWithoutExtent"]')).toContainText('IS-02');
  await expect(dialog.locator('[data-kind="fewBoundaries"]')).toContainText('IS-01, IS-02');
  await dialog.getByRole('button', { name: 'Start counting anyway' }).click();
  await expect(dialog).toBeHidden();

  // Parts count: the counting tools, the item and count table; no set-up.
  await expect(stages).toHaveAttribute('data-stage', 'count');
  await expect(toolbar.getByRole('radio', { name: 'Circle' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(toolbar.getByRole('radio', { name: 'Stamp' })).toBeVisible();
  await expect(toolbar.getByRole('radio', { name: 'Highlighter' })).toHaveCount(0);
  await expect(toolbar.getByRole('radio', { name: 'ESDV' })).toHaveCount(0);
  await expect(page.getByTestId('segment-details')).toHaveCount(0);
  await expect(page.getByLabel('Fluid')).toHaveCount(0);
  await expect(page.getByTestId('segment-count-panel').getByLabel('Status')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Count table' })).toBeVisible();
  await expect(page.getByTestId('left-pane').getByRole('button', { name: 'Segment' })).toHaveCount(
    0,
  );
  await expect(page.getByTestId('segment-list')).toContainText('0 items');

  // The ESDV is dimmed and locked: Select clicks through it.
  await expect(esdv).toHaveAttribute('data-dimmed', 'true');
  await page.keyboard.press('v');
  await clickCanvas(page, 0.5, 0.5);
  await expect(page.getByTestId('marker-inspector')).toHaveCount(0);
  await page.keyboard.press('h');
  await expect(page.getByText('Highlighter is used to define segments.')).toBeVisible();

  // A circle counts an item in the active segment.
  await page.keyboard.press('c');
  await clickCanvas(page, 0.3, 0.3);
  await expect(page.getByTestId('marker-inspector')).toContainText('Item #1');
  await expect(page.locator('[data-shape="circle"]')).toHaveAttribute('data-dimmed', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('segment-list')).toContainText('1 item');

  // The stage is saved with the project, and going back is one click.
  await expect
    .poll(async () => JSON.parse(await app.readText(dir, 'project.qrapc.json')).stage, {
      timeout: 10_000,
    })
    .toBe('count');
  await stages.getByRole('radio', { name: /Segments/ }).click();
  await expect(stages).toHaveAttribute('data-stage', 'segments');
  await expect(toolbar.getByRole('radio', { name: 'Highlighter' })).toBeVisible();
  await app.removeDirectory(dir);
});
