/**
 * Markup engine (roadmap #16–19): circle and dashed-highlight tools, select,
 * move, resize, copy/paste, delete, box select, undo/redo, labels, tooltips
 * and filters (ANN-01..08, PRJ-09).
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { setStage } from './helpers';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

/** Opens the seeded drawing; the project is counting unless `extra` says otherwise. */
async function openDrawing(app: AppFixture, name: string, extra: Record<string, unknown> = {}) {
  const dir = `markup-${name}-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', revision: 'C', ...A1 }],
    { stage: 'count', ...extra },
  );
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  return { dir, page };
}

/** A point on the canvas, as fractions of its width and height. */
async function at(page: Page, fx: number, fy: number) {
  const box = (await page.getByRole('application').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function click(page: Page, fx: number, fy: number) {
  const p = await at(page, fx, fy);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

async function savedProject(app: AppFixture, dir: string) {
  await expect(app.page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  return JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
    markers: {
      id: string;
      shape: string;
      segmentId: string | null;
      geometry: Record<string, unknown>;
    }[];
    segments: { id: string; drawingIds: string[] }[];
  };
}

const markers = (page: Page) => page.getByTestId('marker');

/** Opacity (0–255) of the marker canvas at a page point. */
async function markerPixel(page: Page, p: { x: number; y: number }): Promise<number> {
  return page.getByTestId('marker-canvas').evaluate((canvas: HTMLCanvasElement, point) => {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = Math.round((point.x - rect.left) * scale);
    const y = Math.round((point.y - rect.top) * scale);
    return canvas.getContext('2d')!.getImageData(x, y, 1, 1).data[3]!;
  }, p);
}

/** Page position of a drawing point, from the viewer's current view (0° rotation). */
async function screenOf(page: Page, x: number, y: number) {
  const viewer = page.getByTestId('drawing-viewer');
  const zoom = Number(await viewer.getAttribute('data-zoom'));
  const vx = Number(await viewer.getAttribute('data-center-x'));
  const vy = Number(await viewer.getAttribute('data-center-y'));
  const box = (await page.getByRole('application').boundingBox())!;
  const k = zoom * (96 / 72);
  return { x: box.x + box.width / 2 + (x - vx) * k, y: box.y + box.height / 2 + (y - vy) * k };
}

test.describe('markup engine', () => {
  test('places circles and dashed highlights in drawing coordinates (ANN-01, ANN-02)', async ({
    app,
  }) => {
    const { dir, page } = await openDrawing(app, 'place');
    await page.getByRole('application').focus();

    // Circle: click places the default size; drag sets the radius.
    await page.keyboard.press('c');
    // The toolbar's Circle tool (the equipment bar has a Circle shape too).
    await expect(
      page.getByTestId('toolbar').getByRole('radio', { name: 'Circle' }),
    ).toHaveAttribute('aria-checked', 'true');
    await click(page, 0.3, 0.4);
    await drag(page, [0.5, 0.5], [0.55, 0.5]);
    await expect(markers(page)).toHaveCount(2);
    await expect(markers(page).first()).toHaveAttribute('data-shape', 'circle');
    // No active segment: the markers are unassigned and flagged (amber outline).
    await expect(markers(page).first()).toHaveAttribute('data-warning', 'true');
    // No active segment and no equipment type yet: both markers carry warnings.
    await expect(page.getByTestId('status-warnings')).toHaveText('2 markers with warnings');

    // Dashed highlight, while defining segments: drag a rectangle, then click a line run.
    await setStage(page, 'segments');
    await page.getByRole('application').focus();
    await page.keyboard.press('d');
    await drag(page, [0.1, 0.1], [0.2, 0.2]);
    await click(page, 0.6, 0.2);
    await click(page, 0.7, 0.2);
    await expect(page.getByRole('status').filter({ hasText: 'Double-click' })).toBeVisible();
    const end = await at(page, 0.7, 0.3);
    await page.mouse.dblclick(end.x, end.y);
    await expect(markers(page)).toHaveCount(4);
    await expect(page.locator('[data-shape="rect"]')).toHaveCount(1);
    await expect(page.locator('[data-shape="polyline"]')).toHaveCount(1);

    const project = await savedProject(app, dir);
    const [small, big] = project.markers.filter((m) => m.shape === 'circle');
    expect(Number(big!.geometry.r)).toBeGreaterThan(Number(small!.geometry.r));
    // Geometry is in PDF points on the A1 sheet, not screen pixels.
    for (const m of project.markers) {
      const g = m.geometry as { cx?: number; x?: number; points?: number[][] };
      const x = g.cx ?? g.x ?? g.points![0]![0]!;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(A1.width);
    }
    const line = project.markers.find((m) => m.shape === 'dashedHighlight' && m.geometry.points);
    expect((line!.geometry.points as unknown[]).length).toBe(3);

    // ANN-02: a marker stays on the same spot of the drawing while zooming.
    const spot = await at(page, 0.3, 0.4);
    const empty = await at(page, 0.9, 0.9);
    expect(await markerPixel(page, spot)).toBeGreaterThan(0);
    expect(await markerPixel(page, empty)).toBe(0);
    const zoom = Number(await page.getByTestId('drawing-viewer').getAttribute('data-zoom'));
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.wheel(0, -400);
    await expect
      .poll(async () => Number(await page.getByTestId('drawing-viewer').getAttribute('data-zoom')))
      .toBeGreaterThan(zoom * 1.5);
    expect(await markerPixel(page, spot)).toBeGreaterThan(0);
    // Clicking the same spot with the select tool still finds the marker.
    await page.keyboard.press('v');
    await page.mouse.click(spot.x, spot.y);
    await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
    await app.removeDirectory(dir);
  });

  test('selects, moves, resizes, copies, pastes and deletes markers (ANN-04)', async ({ app }) => {
    const { dir, page } = await openDrawing(app, 'edit');
    await page.getByRole('application').focus();
    await page.keyboard.press('c');
    await click(page, 0.3, 0.3);
    await click(page, 0.4, 0.3);
    // Placing a circle puts the focus in its size field.
    await page.getByRole('application').focus();
    await page.keyboard.press('v');
    await expect(markers(page)).toHaveCount(2);

    // Click selects one marker and shows its resize handles.
    await click(page, 0.3, 0.3);
    await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
    await expect(page.getByTestId('marker-handle')).toHaveCount(4);
    await expect(page.getByTestId('marker-inspector')).toContainText('Circle');

    // Drag it to move it.
    const before = (await savedProject(app, dir)).markers;
    await drag(page, [0.3, 0.3], [0.3, 0.5]);
    await expect
      .poll(async () => {
        const moved = (await savedProject(app, dir)).markers.find((m) => m.id === before[0]!.id);
        return Number(moved!.geometry.cy) - Number(before[0]!.geometry.cy);
      })
      .toBeGreaterThan(20);

    // Drag the east handle to resize it.
    const handle = (await page.locator('[data-handle="e"]').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 60, handle.y + handle.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const resized = (await savedProject(app, dir)).markers.find((m) => m.id === before[0]!.id);
        return Number(resized!.geometry.r);
      })
      .toBeGreaterThan(Number(before[0]!.geometry.r) * 2);

    // Copy and paste.
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect(markers(page)).toHaveCount(3);

    // Box-select everything and delete it; undo brings it back.
    await drag(page, [0.02, 0.02], [0.98, 0.98]);
    await expect(page.locator('[data-selected="true"]')).toHaveCount(3);
    await expect(page.getByTestId('marker-inspector')).toContainText('3 markers selected');
    await page.keyboard.press('Delete');
    await expect(markers(page)).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(markers(page)).toHaveCount(3);
    await page.keyboard.press('Control+y');
    await expect(markers(page)).toHaveCount(0);
    await app.removeDirectory(dir);
  });

  test('keeps at least 100 undo steps (PRJ-09)', async ({ app }) => {
    const { dir, page } = await openDrawing(app, 'undo');
    await page.getByRole('application').focus();
    await page.keyboard.press('c');
    const steps = 102;
    for (let i = 0; i < steps; i += 1) {
      await click(page, 0.1 + (i % 17) * 0.05, 0.15 + Math.floor(i / 17) * 0.12);
    }
    await expect(markers(page)).toHaveCount(steps);
    // Placing a circle puts the focus in its size field; undo belongs to the canvas.
    await page.getByRole('application').focus();
    for (let i = 0; i < steps - 1; i += 1) await page.keyboard.press('Control+z');
    await expect(markers(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    // ANN-08: the shortcut sheet is one menu click away.
    await page.getByRole('button', { name: 'Project' }).click();
    await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toContainText('Ctrl+Z');
    await expect(sheet).toContainText('Dashed highlight');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await app.removeDirectory(dir);
  });

  test('colours markers by segment, shows labels, tooltips and filters (ANN-03, ANN-05..07)', async ({
    app,
  }) => {
    const segment = {
      id: 'seg_is01',
      label: 'IS-01',
      colour: 2,
    };
    const { dir, page } = await openDrawing(app, 'segments', {
      segments: [segment],
      markers: [
        {
          id: 'mkr_valve',
          drawingId: 'drw_seed0',
          segmentId: 'seg_is01',
          shape: 'circle',
          geometry: { type: 'circle', cx: 700, cy: 700, r: 14 },
        },
      ],
      items: [
        {
          id: 'itm_1',
          seq: 1,
          markerId: 'mkr_valve',
          segmentId: 'seg_is01',
          drawingId: 'drw_seed0',
          tag: 'HV-101',
          nominalSize: 2,
        },
      ],
      nextItemSeq: 2,
    });

    // The seeded marker takes the segment colour and shows its tag as a label.
    const valve = page.locator('[data-marker-id="mkr_valve"]');
    await expect(valve).toHaveAttribute('data-segment-id', 'seg_is01');
    await expect(valve).toHaveAttribute('data-colour', '#117733');
    await expect(valve).toHaveText('HV-101');
    await page.getByRole('button', { name: 'Show marker labels' }).click();
    await expect(valve).toHaveText('Circle');
    await page.getByRole('button', { name: 'Show marker labels' }).click();

    // Hover shows the attributes; double-click opens the edit panel.
    const centre = await screenOf(page, 700, 700);
    expect(await markerPixel(page, centre)).toBeGreaterThan(0);
    await page.mouse.move(centre.x, centre.y);
    await expect(page.getByTestId('marker-tooltip')).toContainText('IS-01');
    await expect(page.getByTestId('marker-tooltip')).toContainText('2"');
    await page.mouse.dblclick(centre.x, centre.y);
    await expect(page.getByTestId('marker-inspector')).toBeVisible();
    // The valve has no type yet, so the item editor focuses the type.
    await expect(page.getByRole('combobox', { name: 'Equipment type' })).toBeFocused();

    // New markers go to the active segment (SEG-06).
    await page.getByRole('combobox', { name: 'Choose a segment' }).click();
    await page.getByRole('option', { name: 'IS-01' }).click();
    await page.getByRole('application').focus();
    await page.keyboard.press('c');
    await click(page, 0.6, 0.6);
    await expect(page.locator('[data-segment-id="seg_is01"]')).toHaveCount(2);
    // Placing a circle puts the focus in its size field.
    await page.getByRole('application').focus();
    await page.keyboard.press('v');

    // Filters: hide the segment; the chip in the status bar shows it again.
    await page.getByRole('button', { name: 'Marker filters' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'IS-01' }).click();
    await page.keyboard.press('Escape');
    await expect(markers(page)).toHaveCount(0);
    await expect(page.getByTestId('filter-chip')).toHaveText(/Hidden: IS-01/);
    await page.getByRole('button', { name: 'Show IS-01 again' }).click();
    await expect(markers(page)).toHaveCount(2);

    // Reassigning a marker in the panel moves it to no segment.
    await click(page, 0.6, 0.6);
    await page.getByRole('combobox', { name: 'Segment', exact: true }).click();
    await page.getByRole('option', { name: 'No segment' }).click();
    await expect(page.locator('[data-segment-id="seg_is01"]')).toHaveCount(1);

    const project = await savedProject(app, dir);
    expect(project.segments[0]!.drawingIds).toEqual(['drw_seed0']);
    await app.removeDirectory(dir);
  });
});
