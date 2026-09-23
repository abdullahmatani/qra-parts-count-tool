/**
 * Segment notes and drawing links (roadmap #32–35): formatted, signed notes
 * with marker references, link hotspots, following links with Back, and the
 * link overlay toggle (NTE-01, NTE-02, NTE-04, LNK-01..03).
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

async function open(app: AppFixture, name: string, extra: Record<string, unknown> = {}) {
  const dir = `${name}-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 },
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1002', ...A1 },
    ],
    extra,
  );
  await openSeeded(app, dir);
  return { dir, page: app.page };
}

async function at(page: Page, fx: number, fy: number) {
  const box = (await page.getByRole('application').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

const zoomOf = async (page: Page) =>
  Number(await page.getByTestId('drawing-viewer').getAttribute('data-zoom'));

test.describe('segment notes', () => {
  test('adds signed, formatted notes that can refer to a marker (NTE-01, NTE-02, NTE-04)', async ({
    app,
  }) => {
    const { dir, page } = await open(app, 'notes', {
      segments: [{ id: 'seg_1', label: 'IS-01', colour: 1, drawingIds: ['drw_seed1'] }],
      markers: [
        {
          id: 'mkr_1',
          drawingId: 'drw_seed1',
          segmentId: 'seg_1',
          shape: 'circle',
          geometry: { type: 'circle', cx: 600, cy: 500, r: 12 },
        },
      ],
      items: [
        {
          id: 'itm_1',
          seq: 1,
          markerId: 'mkr_1',
          drawingId: 'drw_seed1',
          segmentId: 'seg_1',
          tag: 'HV-7',
        },
      ],
      nextItemSeq: 2,
    });

    // Sign notes with initials (NTE-02).
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Your initials').fill('AM');
    await page.keyboard.press('Escape');

    await page.getByTestId('segment-list').getByRole('button', { name: /IS-01/ }).click();
    const panel = page.getByTestId('notes-panel');
    const editor = panel.getByLabel('Add note');
    await editor.fill('Flanges assumed ANSI 300');
    await editor.selectText();
    await panel.getByRole('button', { name: 'Bold' }).click();
    await editor.press('End');
    await editor.pressSequentially('\nvents\ndrains');
    await editor.press('Control+Enter');
    const note = panel.getByTestId('note');
    await expect(note).toHaveCount(1);
    await expect(note.locator('strong')).toHaveText('Flanges assumed ANSI 300');
    await expect(note).toContainText('AM');

    // A note that refers to the selected marker; the reference jumps to it.
    await page.getByTestId('drawing-list').getByText('PEFS-1002').click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    await page
      .getByTestId('segment-drawings')
      .getByRole('button', { name: /Open PEFS-1002/ })
      .click();
    const marker = page.locator('[data-marker-id="mkr_1"]');
    await expect(marker).toBeAttached();
    // Select it through the segment's linked-drawing zoom: it is in the middle of the view.
    const centre = await at(page, 0.5, 0.5);
    await page.mouse.click(centre.x, centre.y);
    await expect(marker).toHaveAttribute('data-selected', 'true');
    await panel.getByRole('button', { name: 'Refer to the selected marker' }).click();
    await editor.fill('Check HV-7 rating');
    await panel.getByRole('button', { name: 'Add note' }).click();
    await expect(note).toHaveCount(2);
    await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
    await note.nth(1).getByRole('button', { name: 'Refers to HV-7' }).click();
    await expect(page.getByRole('tab', { name: 'PEFS-1002' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(marker).toHaveAttribute('data-selected', 'true');

    // Delete, then undo.
    await note.first().hover();
    await note.first().getByRole('button', { name: 'Delete note' }).click();
    await expect(note).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(note).toHaveCount(2);

    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
      timeout: 10_000,
    });
    const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
      notes: { author: string; text: string; markerRef: string | null }[];
    };
    // Undo re-adds the deleted note, so file order is not creation order.
    expect(project.notes).toHaveLength(2);
    expect(project.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          author: 'AM',
          text: '**Flanges assumed ANSI 300**\nvents\ndrains',
        }),
        expect.objectContaining({ markerRef: 'mkr_1' }),
      ]),
    );
    await app.removeDirectory(dir);
  });
});

test.describe('drawing links', () => {
  test('links drawings, follows links with Back and hides the overlay (LNK-01..03)', async ({
    app,
  }) => {
    const { dir, page } = await open(app, 'links');
    await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    const startZoom = await zoomOf(page);

    // LNK-01: draw a hotspot with the link tool and point it at PEFS-1002.
    await page.getByRole('application').focus();
    await page.keyboard.press('l');
    const a = await at(page, 0.7, 0.6);
    const b = await at(page, 0.8, 0.7);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    const editor = page.getByTestId('link-editor');
    await editor.getByRole('combobox', { name: 'Target drawing' }).click();
    await page.getByRole('option', { name: 'PEFS-1002' }).click();
    const label = editor.getByLabel('Label');
    await label.fill('Continued on PEFS-1002');
    await label.press('Enter');
    const link = page.getByTestId('drawing-link');
    await expect(link).toHaveAttribute('data-status', 'ok');

    // LNK-02: a click with the Select tool follows it; Back returns to the same view.
    await page.getByRole('application').focus();
    await page.keyboard.press('v');
    const inside = await at(page, 0.75, 0.65);
    await page.mouse.click(inside.x, inside.y);
    await expect(page.getByRole('tab', { name: 'PEFS-1002' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('application').focus();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('+');
    const zoomed = await zoomOf(page);
    await page.getByRole('button', { name: 'Back to PEFS-1001' }).click();
    await expect(page.getByRole('tab', { name: 'PEFS-1001' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect.poll(() => zoomOf(page)).toBeCloseTo(startZoom, 5);

    // Save the target's current (zoomed) view on the link, then follow it again.
    await page.getByRole('application').focus();
    await page.keyboard.press('l');
    await page.mouse.click(inside.x, inside.y);
    await editor.getByRole('button', { name: "Save the target's current view" }).click();
    await expect(editor.getByTestId('link-view')).toHaveText(/Saved view/);
    await editor.getByRole('button', { name: 'Open target' }).click();
    await expect.poll(() => zoomOf(page)).toBeCloseTo(zoomed, 5);
    await page.getByRole('application').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.getByRole('tab', { name: 'PEFS-1001' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // LNK-03: hide the links; a click there no longer navigates.
    await page.getByRole('button', { name: 'Show drawing links' }).click();
    await expect(link).toHaveCount(0);
    await page.getByRole('application').focus();
    await page.keyboard.press('v');
    await page.mouse.click(inside.x, inside.y);
    await expect(page.getByRole('tab', { name: 'PEFS-1001' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
      timeout: 10_000,
    });
    const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
      links: { targetDrawingId: string; label: string; targetView: unknown }[];
    };
    expect(project.links).toEqual([
      expect.objectContaining({
        targetDrawingId: 'drw_seed1',
        label: 'Continued on PEFS-1002',
        targetView: expect.objectContaining({ zoom: expect.any(Number) }),
      }),
    ]);
    await app.removeDirectory(dir);
  });
});
