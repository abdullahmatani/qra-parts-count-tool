/**
 * Isolatable segments (roadmap #20–24): ESDV markers, the segment panel,
 * drawing links and navigation, the active segment and the ESDV boundary
 * rule with per-ESDV override (SEG-01..06, SEG-08).
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

async function open(app: AppFixture) {
  const dir = `segments-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [
    { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 },
    { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1002', ...A1 },
  ]);
  await openSeeded(app, dir);
  return { dir, page: app.page };
}

async function clickCanvas(page: Page, fx: number, fy: number) {
  const box = (await page.getByRole('application').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function dragCanvas(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByRole('application').boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 5 });
  await page.mouse.up();
}

async function newSegment(page: Page, fields: { fluid?: string } = {}) {
  await page.getByTestId('left-pane').getByRole('button', { name: 'Segment' }).click();
  const dialog = page.getByRole('dialog', { name: 'New segment' });
  if (fields.fluid) await dialog.getByLabel('Fluid').fill(fields.fluid);
  const label = await dialog.getByLabel('Label').inputValue();
  await dialog.getByRole('button', { name: 'Create segment' }).click();
  await expect(dialog).toBeHidden();
  return label;
}

async function choose(page: Page, combobox: string, option: string) {
  await page.getByRole('combobox', { name: combobox, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('isolatable segments', () => {
  test('creates segments, marks ESDVs and applies the boundary rule (SEG-01..03, SEG-08)', async ({
    app,
  }) => {
    const { dir, page } = await open(app);

    // SEG-02: the label is suggested; the new segment becomes active (SEG-06).
    expect(await newSegment(page, { fluid: 'Gas' })).toBe('IS-01');
    await expect(page.getByTestId('active-segment-chip')).toHaveText('New markers go to IS-01');
    // Process data entered: folded to one line, opened on a click.
    const details = page.getByTestId('segment-details');
    await expect(details.getByTestId('process-summary')).toHaveText('Gas');
    await details.getByTestId('process-toggle').click();
    await expect(details.getByLabel('Fluid')).toHaveValue('Gas');
    expect(await newSegment(page)).toBe('IS-02');
    await expect(page.getByTestId('segment-list').getByRole('button')).toHaveCount(2);

    // Labels stay unique.
    const label = page.getByTestId('segment-details').getByLabel('Label');
    await label.fill('IS-01');
    await label.press('Enter');
    await expect(page.getByText('Another segment already uses this label.')).toBeVisible();
    await label.press('Escape');

    // SEG-01: place an ESDV; the panel opens on its tag.
    await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    await page.getByRole('application').focus();
    await page.keyboard.press('e');
    await clickCanvas(page, 0.5, 0.5);
    const tag = page.getByLabel('Tag');
    await expect(tag).toBeFocused();
    await tag.fill('ESDV-101');
    const size = page.getByTestId('esdv-editor').getByLabel('Size');
    await size.fill('12"');
    await size.press('Enter');
    await choose(page, 'Upstream segment', 'IS-01');
    await choose(page, 'Downstream segment', 'IS-02');
    const esdv = page.locator('[data-shape="esdv"]');
    await expect(esdv).toHaveText('ESDV-101');
    await expect(esdv).toHaveAttribute('data-colour', '#dc2626');

    // SEG-08: the project rule (upstream) applies until the ESDV overrides it.
    const countedIn = page.getByTestId('esdv-counted-in');
    await expect(countedIn).toHaveText('This ESDV is counted in: IS-01');
    await choose(page, 'Counted in', 'Both segments');
    await expect(countedIn).toHaveText('This ESDV is counted in: IS-01, IS-02');

    // SEG-03: both segments list the ESDV as a bounding ESDV.
    await expect(page.getByTestId('segment-esdvs')).toContainText('ESDV-101');
    await expect(page.getByText(/Only 1 bounding ESDV/)).toBeVisible();

    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
      timeout: 10_000,
    });
    const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
      segments: { label: string; boundingEsdvIds: string[]; fluid: string }[];
      markers: { id: string; esdv: Record<string, unknown> | null }[];
    };
    const saved = project.markers.find((m) => m.esdv)!;
    expect(saved.esdv).toMatchObject({
      tag: 'ESDV-101',
      nominalSize: 12,
      sizeUnit: 'in',
      boundaryRuleOverride: 'both',
    });
    expect(project.segments.map((s) => s.boundingEsdvIds)).toEqual([[saved.id], [saved.id]]);
    expect(project.segments[0]!.fluid).toBe('Gas');
    await app.removeDirectory(dir);
  });

  test('links drawings, opens them at the segment and deletes a segment (SEG-04, SEG-05)', async ({
    app,
  }) => {
    const { dir, page } = await open(app);
    await newSegment(page);
    await newSegment(page);

    // A marker links its drawing to the active segment (IS-02): two dashed zones.
    await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    await page.getByRole('application').focus();
    await page.keyboard.press('d');
    await dragCanvas(page, [0.28, 0.28], [0.3, 0.3]);
    await dragCanvas(page, [0.31, 0.31], [0.33, 0.33]);
    const drawings = page.getByTestId('segment-drawings');
    await expect(drawings).toContainText('PEFS-1001');
    await expect(drawings).toContainText('2 markers');

    // Link a second drawing by hand, then open it from the list.
    await choose(page, 'Link a drawing', 'PEFS-1002');
    await expect(drawings).toContainText('PEFS-1002');
    await page.getByRole('button', { name: 'Open PEFS-1002 at this segment' }).click();
    await expect(page.getByRole('tab', { name: 'PEFS-1002' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // SEG-05: opening PEFS-1001 zooms in on the segment's markers.
    const viewer = page.getByTestId('drawing-viewer');
    await page.getByRole('button', { name: 'Open PEFS-1001 at this segment' }).click();
    await expect(page.getByRole('tab', { name: 'PEFS-1001' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect
      .poll(async () => Number(await viewer.getAttribute('data-zoom')))
      .toBeGreaterThan(1);

    await page.getByRole('button', { name: 'Unlink PEFS-1002' }).click();
    await expect(drawings).not.toContainText('PEFS-1002');

    // Delete IS-02, moving its markers to IS-01.
    await page.getByRole('button', { name: 'Delete segment' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete segment IS-02?' });
    await expect(confirm).toContainText('2 markers');
    await confirm.getByRole('button', { name: 'Delete segment' }).click();
    await expect(page.getByTestId('segment-list').getByRole('button')).toHaveCount(1);
    await expect(page.getByTestId('active-segment-chip')).toHaveText('New markers go to IS-01');
    await expect(page.locator('[data-segment-id]')).toHaveCount(2);
    for (const marker of await page.getByTestId('marker').all()) {
      await expect(marker).toHaveAttribute('data-segment-id', /^seg_/);
    }

    // Undo restores the segment.
    await page.getByRole('application').focus();
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('segment-list').getByRole('button')).toHaveCount(2);
    await app.removeDirectory(dir);
  });
});
