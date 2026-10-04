/**
 * The Highlighter tool: free-hand strokes painted over a segment's pipework
 * and equipment in the segment's colour, straight with Shift, with a choice
 * of pen, and changed or deleted like any other marker.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

async function at(page: Page, fx: number, fy: number) {
  const box = (await page.getByRole('application').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function drag(page: Page, points: [number, number][]) {
  const [first, ...rest] = points;
  const start = await at(page, ...first!);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of rest) {
    const p = await at(page, ...point);
    await page.mouse.move(p.x, p.y, { steps: 8 });
  }
  await page.mouse.up();
}

interface Saved {
  markers: {
    id: string;
    shape: string;
    segmentId: string | null;
    geometry: { type: string; points: number[][]; width: number };
  }[];
  items: { markerId: string }[];
}

test('highlights a segment with free-hand and straight strokes', async ({ app }) => {
  const dir = `highlighter-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }], {
    segments: [{ id: 'seg_1', label: 'IS-01', colour: 1, drawingIds: [] }],
  });
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await page.getByTestId('segment-list').getByRole('button', { name: /IS-01/ }).click();

  // H picks the Highlighter; its options replace the equipment bar.
  await page.getByRole('application').focus();
  await page.keyboard.press('h');
  const bar = page.getByTestId('highlighter-bar');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('equipment-bar')).toHaveCount(0);
  await expect(bar.getByTestId('highlighter-segment')).toHaveText('Highlighting IS-01');
  await expect(bar.getByTestId('pen-medium')).toHaveAttribute('aria-checked', 'true');

  // A free-hand stroke, then a straight one with Shift and the broad pen.
  await drag(page, [
    [0.2, 0.3],
    [0.3, 0.32],
    [0.4, 0.3],
    [0.45, 0.4],
  ]);
  const strokes = page.locator('[data-testid="marker"][data-shape="stroke"]');
  await expect(strokes).toHaveCount(1);
  await expect(strokes.first()).toHaveAttribute('data-segment-id', 'seg_1');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);

  await bar.getByTestId('pen-broad').click();
  await page.keyboard.down('Shift');
  await drag(page, [
    [0.2, 0.6],
    [0.3, 0.63],
    [0.5, 0.58],
    [0.6, 0.6],
  ]);
  await page.keyboard.up('Shift');
  await expect(strokes).toHaveCount(2);

  // A click without a drag paints nothing and says how.
  const spot = await at(page, 0.7, 0.2);
  await page.mouse.click(spot.x, spot.y);
  await expect(
    page.getByText('Drag over the pipework and equipment to highlight them.'),
  ).toBeVisible();
  await expect(strokes).toHaveCount(2);

  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  let project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
  const [freehand, straight] = project.markers;
  expect(freehand).toMatchObject({ shape: 'highlighter', segmentId: 'seg_1' });
  expect(freehand!.geometry.type).toBe('stroke');
  expect(freehand!.geometry.points.length).toBeGreaterThan(2);
  expect(freehand!.geometry.width).toBeCloseTo(A1.width / 150, 3);
  expect(straight!.geometry.points).toHaveLength(2);
  expect(straight!.geometry.width).toBeCloseTo(A1.width / 75, 3);
  // Highlights mark out the segment; they are not counted.
  expect(project.items).toEqual([]);

  // Esc returns to Select (and its hint, while defining segments); a stroke
  // is then selected, repainted with the fine pen and deleted.
  await page.getByRole('application').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-hint-bar')).toBeVisible();
  const onStroke = await at(page, 0.4, 0.6);
  await page.mouse.click(onStroke.x, onStroke.y);
  const inspector = page.getByTestId('marker-inspector');
  await expect(inspector).toContainText('Highlighter stroke');
  await expect(inspector.getByTestId('marker-pen-broad')).toHaveAttribute('aria-checked', 'true');
  await inspector.getByTestId('marker-pen-fine').click();
  await expect(inspector.getByTestId('marker-pen-fine')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
  expect(project.markers[1]!.geometry.width).toBeCloseTo(A1.width / 300, 3);

  await page.getByRole('application').focus();
  await page.keyboard.press('Delete');
  await expect(strokes).toHaveCount(1);
  await app.removeDirectory(dir);
});
