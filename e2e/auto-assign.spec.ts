/**
 * Equipment on a highlighted segment (SEG-06): a circle placed on a segment's
 * highlighting goes to that segment rather than the active one, and one moved
 * onto another segment's highlighting follows it. Settings turns this off.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

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
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test('assigns equipment to the segment highlighted under it', async ({ app }) => {
  const dir = `auto-assign-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }], {
    segments: [
      { id: 'seg_1', label: 'IS-01', colour: 1, drawingIds: [] },
      { id: 'seg_2', label: 'IS-02', colour: 2, drawingIds: [] },
    ],
  });
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  const segments = page.getByTestId('segment-list');

  // IS-02's pipe, highlighted with a straight stroke.
  await segments.getByRole('button', { name: /IS-02/ }).click();
  await page.getByRole('application').focus();
  await page.keyboard.press('h');
  await page.getByTestId('highlighter-bar').getByTestId('pen-broad').click();
  await page.keyboard.down('Shift');
  await drag(page, [0.2, 0.5], [0.8, 0.5]);
  await page.keyboard.up('Shift');
  await expect(page.locator('[data-testid="marker"][data-shape="stroke"]')).toHaveCount(1);

  // With IS-01 active, a circle on IS-02's paint goes to IS-02; one beside it to IS-01.
  await segments.getByRole('button', { name: /IS-01/ }).click();
  await page.getByRole('application').focus();
  await page.keyboard.press('c');
  await click(page, 0.4, 0.5);
  await click(page, 0.6, 0.25);
  const circles = page.locator('[data-testid="marker"][data-shape="circle"]');
  await expect(circles).toHaveCount(2);
  await expect(circles.nth(0)).toHaveAttribute('data-segment-id', 'seg_2');
  await expect(circles.nth(1)).toHaveAttribute('data-segment-id', 'seg_1');

  // Dragged onto the paint, the second one follows it to IS-02.
  await page.getByRole('application').focus();
  await page.keyboard.press('v');
  await drag(page, [0.6, 0.25], [0.6, 0.5]);
  await expect(circles.nth(1)).toHaveAttribute('data-segment-id', 'seg_2');

  // Switched off in Settings, new equipment goes to the active segment.
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const toggle = dialog.getByRole('switch', {
    name: 'Assign equipment to the highlighted segment',
  });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('application').focus();
  await page.keyboard.press('c');
  await click(page, 0.5, 0.5);
  await expect(circles).toHaveCount(3);
  await expect(circles.nth(2)).toHaveAttribute('data-segment-id', 'seg_1');

  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
    markers: { shape: string; segmentId: string | null }[];
    items: { segmentId: string | null }[];
  };
  // Items go with their markers.
  expect(project.items.map((i) => i.segmentId)).toEqual(['seg_2', 'seg_2', 'seg_1']);
  await app.removeDirectory(dir);
});
