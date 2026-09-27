/**
 * ESDVs as segment boundaries (SEG-01): an ESDV drawn as a ring or as a
 * double line across the pipe cuts the highlighter strokes it crosses, and a
 * highlighter stroke begun or ended near an ESDV snaps to it and stops there.
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { clickDrawing, toScreen } from './helpers';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };
/** A horizontal pipe run across the middle of the sheet. */
const PIPE_Y = 842;

/** Drags through points given in drawing coordinates. */
async function drag(page: Page, points: [number, number][]) {
  const [first, ...rest] = points;
  const start = await toScreen(page, ...first!);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of rest) {
    const p = await toScreen(page, ...point);
    await page.mouse.move(p.x, p.y, { steps: 8 });
  }
  await page.mouse.up();
}

type Pair = [number, number];

interface Saved {
  markers: {
    id: string;
    shape: string;
    segmentId: string | null;
    esdv: { tag: string } | null;
    geometry:
      | { type: 'circle'; cx: number; cy: number; r: number }
      | { type: 'doubleLine'; points: [Pair, Pair]; gap: number }
      | { type: 'stroke'; points: Pair[]; width: number };
  }[];
}

async function open(app: AppFixture, name: string) {
  const dir = `${name}-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }], {
    segments: [{ id: 'seg_1', label: 'IS-01', colour: 1, drawingIds: [] }],
  });
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await page.getByTestId('segment-list').getByRole('button', { name: /IS-01/ }).click();
  return { dir, page };
}

async function saved(app: AppFixture, dir: string) {
  await expect(app.page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  return JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
}

test('an ESDV drawn as a double line cuts the highlighter across it', async ({ app }) => {
  const { dir, page } = await open(app, 'esdv-line');
  const strokes = page.locator('[data-testid="marker"][data-shape="stroke"]');

  // Highlight the pipe run with one straight stroke.
  await page.getByRole('application').focus();
  await page.keyboard.press('h');
  await page.keyboard.down('Shift');
  await drag(page, [
    [600, PIPE_Y],
    [1800, PIPE_Y],
  ]);
  await page.keyboard.up('Shift');
  await expect(strokes).toHaveCount(1);

  // E picks the ESDV tool; its options replace the equipment bar.
  await page.keyboard.press('e');
  const bar = page.getByTestId('esdv-bar');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('equipment-bar')).toHaveCount(0);
  await expect(bar.getByTestId('esdv-shape-circle')).toHaveAttribute('aria-checked', 'true');
  await bar.getByTestId('esdv-shape-doubleLine').click();
  await expect(bar.getByTestId('esdv-shape-doubleLine')).toHaveAttribute('aria-checked', 'true');

  // Drawn across the pipe, it splits the stroke in two and opens for its tag.
  await drag(page, [
    [1200, PIPE_Y - 42],
    [1200, PIPE_Y + 42],
  ]);
  const esdv = page.locator('[data-shape="esdv"]');
  await expect(esdv).toHaveCount(1);
  await expect(esdv).toHaveAttribute('data-symbol', 'doubleLine');
  await expect(strokes).toHaveCount(2);
  await expect(
    page.getByText(
      'The highlighter is cut at the ESDV: select a piece to move it to another segment.',
    ),
  ).toBeVisible();
  const tag = page.getByLabel('Tag');
  await expect(tag).toBeFocused();
  await tag.fill('ESDV-201');
  await expect(esdv).toHaveText('ESDV-201');

  let project = await saved(app, dir);
  const line = project.markers.find((m) => m.esdv)!;
  expect(line).toMatchObject({ shape: 'doubleLine', esdv: { tag: 'ESDV-201' } });
  if (line.geometry.type !== 'doubleLine') throw new Error('expected a double line');
  const x = line.geometry.points[0][0];
  expect(line.geometry.gap).toBeCloseTo(A1.width / 250, 3);
  const pieces = project.markers.filter((m) => m.shape === 'highlighter');
  expect(pieces.map((m) => m.segmentId)).toEqual(['seg_1', 'seg_1']);
  const [left, right] = pieces.map((m) => m.geometry) as { points: Pair[]; width: number }[];
  // The paint stops at the lines on each side.
  const reach = line.geometry.gap / 2 + left!.width / 2;
  expect(left!.points.at(-1)![0]).toBeCloseTo(x - reach, 3);
  expect(right!.points[0]![0]).toBeCloseTo(x + reach, 3);

  // A click on a stroke puts a double line square across it, and cuts it again.
  await clickDrawing(page, 900, PIPE_Y + 3);
  await expect(esdv).toHaveCount(2);
  await expect(strokes).toHaveCount(3);
  project = await saved(app, dir);
  const across = project.markers.filter((m) => m.esdv).at(-1)!.geometry;
  if (across.type !== 'doubleLine') throw new Error('expected a double line');
  const [[x1, y1], [x2, y2]] = across.points;
  expect(Math.abs(x2 - x1)).toBeLessThan(0.01);
  expect((y1 + y2) / 2).toBeCloseTo(PIPE_Y, 0);

  // One undo takes the ESDV back and mends the stroke.
  await page.getByRole('application').focus();
  await page.keyboard.press('Control+z');
  await expect(esdv).toHaveCount(1);
  await expect(strokes).toHaveCount(2);
  await app.removeDirectory(dir);
});

test('highlighter strokes snap to ESDVs and stop at them', async ({ app }) => {
  const { dir, page } = await open(app, 'esdv-magnet');
  const strokes = page.locator('[data-testid="marker"][data-shape="stroke"]');

  // Two ESDV rings on the pipe.
  await page.getByRole('application').focus();
  await page.keyboard.press('e');
  await clickDrawing(page, 800, PIPE_Y);
  await page.getByRole('application').focus();
  await clickDrawing(page, 1600, PIPE_Y);
  await expect(page.locator('[data-shape="esdv"]')).toHaveCount(2);
  let project = await saved(app, dir);
  const [first, second] = project.markers.map((m) => m.geometry) as {
    cx: number;
    cy: number;
    r: number;
  }[];

  // Start 8 px beside a ring: clear of it, but within the magnet's reach.
  const origin = await toScreen(page, 0, 0);
  const unit = (await toScreen(page, 100, 0)).x - origin.x;
  const beside = first!.r + (8 * 100) / unit;

  await page.getByRole('application').focus();
  await page.keyboard.press('h');
  const snap = page.getByTestId('esdv-snap');
  const near = await toScreen(page, first!.cx + beside, PIPE_Y);
  await page.mouse.move(near.x, near.y);
  await expect(snap).toBeVisible();
  const away = await toScreen(page, 1200, 400);
  await page.mouse.move(away.x, away.y);
  await expect(snap).toHaveCount(0);

  // From beside one ESDV to beside the other: the stroke runs from ring to ring.
  const run: [number, number][] = [
    [first!.cx + beside, PIPE_Y],
    [1200, PIPE_Y],
    [second!.cx - beside, PIPE_Y],
  ];
  await drag(page, run);
  await expect(strokes).toHaveCount(1);
  // Alt turns the magnet off.
  await page.keyboard.down('Alt');
  await drag(page, run);
  await page.keyboard.up('Alt');
  await expect(strokes).toHaveCount(2);

  project = await saved(app, dir);
  const [snapped, free] = project.markers
    .filter((m) => m.shape === 'highlighter')
    .map((m) => m.geometry) as { points: Pair[]; width: number }[];
  const distance = ([x, y]: Pair, ring: { cx: number; cy: number }) =>
    Math.hypot(x - ring.cx, y - ring.cy);
  const edge = first!.r + snapped!.width / 2;
  expect(distance(snapped!.points[0]!, first!)).toBeCloseTo(edge, 3);
  expect(distance(snapped!.points.at(-1)!, second!)).toBeCloseTo(edge, 3);
  expect(distance(free!.points[0]!, first!)).toBeGreaterThan(edge + 2);
  expect(distance(free!.points.at(-1)!, second!)).toBeGreaterThan(edge + 2);
  await app.removeDirectory(dir);
});
