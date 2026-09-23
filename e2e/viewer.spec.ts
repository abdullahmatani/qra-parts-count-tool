import { expect, test } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

test.describe('PDF drawing viewer (DRW-05)', () => {
  test('opens an A1 drawing, zooms, rotates and fits', async ({ app }) => {
    const dir = `viewer-${test.info().project.name}`;
    await app.open();
    await seedProject(app, dir, [
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', revision: 'C', ...A1 },
    ]);
    await openSeeded(app, dir);
    const page = app.page;

    const started = Date.now();
    await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
    const viewer = page.getByTestId('drawing-viewer');
    await expect(viewer).toHaveAttribute('data-zoom', /\d/);
    await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
    // NFR-02 (indicative): A1 drawing shown in under 3 s. See item 15 for the full test.
    expect(Date.now() - started).toBeLessThan(3000);

    const fitZoom = Number(await viewer.getAttribute('data-zoom'));
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect
      .poll(async () => Number(await viewer.getAttribute('data-zoom')))
      .toBeCloseTo(fitZoom * 1.25, 5);

    // Zoom to the 3200 % limit and check the sharp layer renders there.
    await page.getByTestId('viewer-zoom').click(); // 100 %
    await expect(page.getByTestId('viewer-zoom')).toHaveText('100%');
    const surface = page.getByRole('application');
    await surface.focus();
    for (let i = 0; i < 20; i += 1) await page.keyboard.press('+');
    await expect(page.getByTestId('viewer-zoom')).toHaveText('3200%');
    await expect(page.getByTestId('viewer-detail-layer')).toHaveAttribute('data-rendered', 'true');
    await expect(page.getByTestId('status-zoom')).toHaveText('Zoom 3200%');

    await page.getByRole('button', { name: 'Rotate right' }).click();
    await expect(viewer).toHaveAttribute('data-rotation', '90');
    await page.getByRole('button', { name: 'Fit page' }).click();
    await expect.poll(async () => Number(await viewer.getAttribute('data-zoom'))).toBeLessThan(1);
    await expect(page.getByTestId('minimap')).toBeVisible();
    await app.removeDirectory(dir);
  });

  test('pans with a drag and zooms with the wheel at the cursor', async ({ app }) => {
    const dir = `viewer-pan-${test.info().project.name}`;
    await app.open();
    await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }]);
    await openSeeded(app, dir);
    const page = app.page;
    await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
    const surface = page.getByRole('application');
    await expect(page.getByTestId('viewer-controls')).toBeVisible();
    const box = (await surface.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    const before = await page.getByTestId('status-cursor').textContent();
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await page.mouse.move(cx + 101, cy + 50);
    await page.mouse.move(cx, cy);
    const after = await page.getByTestId('status-cursor').textContent();
    expect(after).not.toBe(before);

    const zoomBefore = Number(await page.getByTestId('drawing-viewer').getAttribute('data-zoom'));
    await page.mouse.wheel(0, -500);
    await expect
      .poll(async () => Number(await page.getByTestId('drawing-viewer').getAttribute('data-zoom')))
      .toBeGreaterThan(zoomBefore);
    await app.removeDirectory(dir);
  });

  test('shows a rotated page and a clear error for a missing file', async ({ app }) => {
    const dir = `viewer-rot-${test.info().project.name}`;
    await app.open();
    await seedProject(app, dir, [
      { file: 'PEFS-3001_rotated.pdf', drawingNo: 'PEFS-3001', width: 842, height: 1191 },
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-9999', ...A1 },
    ]);
    await app.page.evaluate(async (d) => {
      const root = await navigator.storage.getDirectory();
      const drawings = await (await root.getDirectoryHandle(d)).getDirectoryHandle('drawings');
      await drawings.removeEntry('PEFS-1001_A1.pdf');
    }, dir);
    await openSeeded(app, dir);
    await app.page.getByTestId('drawing-list').getByText('PEFS-3001').click();
    await expect(app.page.getByTestId('viewer-preview-layer')).toBeVisible();
    await app.page.getByTestId('drawing-list').getByText('PEFS-9999').click();
    await expect(app.page.getByRole('alert')).toContainText('missing');
    await app.removeDirectory(dir);
  });
});
