/**
 * The Eraser: rubs out highlighter paint to trim a segment's highlighting.
 * Where it touches a stroke the stroke is cut, and what is left either side
 * stays in its segment; a whole drag is one undo step. With "Active segment
 * only" it spares the other segments' strokes.
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

/** A straight highlighter stroke (Shift) in the segment called `segment`. */
async function paint(page: Page, segment: RegExp, from: [number, number], to: [number, number]) {
  await page.getByTestId('segment-list').getByRole('button', { name: segment }).click();
  await page.getByRole('application').focus();
  await page.keyboard.press('h');
  await page.keyboard.down('Shift');
  await drag(page, [from, to]);
  await page.keyboard.up('Shift');
}

interface Saved {
  markers: {
    id: string;
    shape: string;
    segmentId: string | null;
    geometry: { type: string; points: number[][]; width: number };
  }[];
}

test('rubs out parts of the highlighting, one drag at a time', async ({ app }) => {
  const dir = `eraser-${test.info().project.name}`;
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

  // Two pipes, one in each segment.
  await paint(page, /IS-01/, [0.2, 0.3], [0.6, 0.3]);
  await paint(page, /IS-02/, [0.2, 0.6], [0.6, 0.6]);
  const strokes = page.locator('[data-testid="marker"][data-shape="stroke"]');
  const inSegment = (id: string) => strokes.and(page.locator(`[data-segment-id="${id}"]`));
  await expect(strokes).toHaveCount(2);

  // X picks the Eraser, with its own bar, and a ring follows the pointer.
  await page.getByRole('application').focus();
  await page.keyboard.press('x');
  const bar = page.getByTestId('eraser-bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId('eraser-target')).toHaveText("Erasing any segment's highlighting");
  await expect(bar.getByTestId('eraser-medium')).toHaveAttribute('aria-checked', 'true');
  const middle = await at(page, 0.4, 0.3);
  await page.mouse.move(middle.x, middle.y);
  await expect(page.getByTestId('eraser-cursor')).toBeVisible();

  // A click in the middle of the first pipe cuts it in two, both in IS-01.
  await page.mouse.click(middle.x, middle.y);
  await expect(inSegment('seg_1')).toHaveCount(2);
  await expect(strokes).toHaveCount(3);

  // The whole erasure is one undo step.
  await page.keyboard.press('Control+z');
  await expect(strokes).toHaveCount(2);
  await page.keyboard.press('Control+y');
  await expect(strokes).toHaveCount(3);

  // Away from the paint, nothing is rubbed out, and the bar says what the eraser is for.
  const paper = await at(page, 0.7, 0.2);
  await page.mouse.click(paper.x, paper.y);
  await expect(page.getByText('Drag over highlighter strokes to rub them out.')).toBeVisible();
  await expect(strokes).toHaveCount(3);

  // Only the active segment (IS-02): a drag down across both pipes cuts only IS-02's.
  await bar.getByTestId('eraser-active-only').click();
  await expect(bar.getByTestId('eraser-target')).toHaveText('Erasing IS-02 only');
  await drag(page, [
    [0.5, 0.2],
    [0.5, 0.7],
  ]);
  await expect(inSegment('seg_2')).toHaveCount(2);
  await expect(inSegment('seg_1')).toHaveCount(2);

  // Esc before letting go cancels the drag and returns to Select.
  await page.getByRole('application').focus();
  const start = await at(page, 0.25, 0.6);
  const end = await at(page, 0.35, 0.6);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('tool-hint-bar')).toBeVisible();
  await expect(strokes).toHaveCount(4);

  // A broad eraser along the left piece of IS-01 rubs it out altogether.
  await page.getByRole('application').focus();
  await page.keyboard.press('x');
  await bar.getByTestId('eraser-active-only').click();
  await bar.getByTestId('eraser-broad').click();
  await drag(page, [
    [0.12, 0.3],
    [0.4, 0.3],
  ]);
  await expect(inSegment('seg_1')).toHaveCount(1);

  // What is left is plain highlighter strokes, drawn with the pen they were painted with.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  const project = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
  const saved = project.markers.filter((m) => m.shape === 'highlighter');
  expect(saved.map((m) => m.segmentId).sort()).toEqual(['seg_1', 'seg_2', 'seg_2']);
  for (const marker of saved) {
    expect(marker.geometry.type).toBe('stroke');
    expect(marker.geometry.width).toBeCloseTo(A1.width / 150, 3);
  }
  // IS-02's pieces still span the pipes' length (cut only at 0.5). IS-01 keeps
  // the part of its pipe right of the middle, where the eraser went.
  const xs = (id: string) =>
    saved.filter((m) => m.segmentId === id).flatMap((m) => m.geometry.points.map(([x]) => x!));
  const [x0, x1] = [Math.min(...xs('seg_2')), Math.max(...xs('seg_2'))];
  expect(Math.min(...xs('seg_1'))).toBeGreaterThan((x0 + x1) / 2);
  expect(Math.max(...xs('seg_1'))).toBeCloseTo(x1, 0);
  await app.removeDirectory(dir);
});
