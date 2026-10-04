/**
 * End flanges and the auto trace: an end flange, a bar across the pipe where a
 * segment ends at a closed drain or the flare, is a segment boundary like an
 * ESDV. Auto trace highlights the active segment out to its ESDVs and end
 * flanges, round bends and curves, straight over crossing lines, and up to the
 * drawing link of an off-page connector; with it on, a click traces a pipe.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { expect, test, type AppFixture } from './fixtures';
import { toScreen } from './helpers';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };
type Pair = [number, number];

interface Saved {
  markers: {
    id: string;
    shape: string;
    segmentId: string | null;
    endFlange: { tag: string; destination: string } | null;
    geometry: { type: string; points: Pair[] };
  }[];
}

async function saved(app: AppFixture, dir: string): Promise<Saved> {
  await expect(app.page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  return JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
}

const strokesOf = (project: Saved, segmentId: string | null) =>
  project.markers
    .filter((m) => m.shape === 'highlighter' && m.segmentId === segmentId)
    .map((m) => m.geometry.points);

const strokePoints = (project: Saved, segmentId: string | null) =>
  strokesOf(project, segmentId).flat();

function distanceToSegment([px, py]: Pair, [ax, ay]: Pair, [bx, by]: Pair): number {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Whether a stroke's path runs within `d` of (x, y). */
const near = (strokes: Pair[][], x: number, y: number, d = 6) =>
  strokes.some((points) =>
    points.some((p, i) => i > 0 && distanceToSegment([x, y], points[i - 1]!, p) <= d),
  );

/**
 * An A1 sheet: a pipe along y = 600 through ESDV A (x 600) and ESDV B (x 1700),
 * with a branch down at x 1000 that bends round a curve to an end flange at
 * x 1420 and a drain header past it, a branch up at x 1300 to an off-page
 * connector, and a line crossing the pipe at x 800 that is not joined to it.
 */
async function sheet(): Promise<URL> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A1.width, A1.height]);
  const black = rgb(0, 0, 0);
  const line = (a: Pair, b: Pair) =>
    page.drawLine({
      start: { x: a[0], y: A1.height - a[1] },
      end: { x: b[0], y: A1.height - b[1] },
      thickness: 3,
      color: black,
    });
  line([300, 600], [2000, 600]);
  line([1000, 600], [1000, 1000]);
  // SVG paths are drawn y down from the given origin: the top-left corner here.
  page.drawSvgPath('M 1000 1000 Q 1000 1150 1150 1150 L 1500 1150', {
    x: 0,
    y: A1.height,
    borderColor: black,
    borderWidth: 3,
  });
  line([1500, 900], [1500, 1450]); // the closed drain header
  line([1300, 600], [1300, 250]); // to the off-page connector
  page.drawRectangle({
    x: 1250,
    y: A1.height - 250,
    width: 100,
    height: 40,
    borderColor: black,
    borderWidth: 3,
  });
  line([800, 400], [800, 800]); // crosses the pipe
  const file = test.info().outputPath('auto-trace.pdf');
  writeFileSync(file, await pdf.save());
  return pathToFileURL(file);
}

async function open(app: AppFixture, name: string, extra: Record<string, unknown>) {
  const dir = `${name}-${test.info().project.name}`;
  const source = await sheet();
  await app.open();
  await seedProject(
    app,
    dir,
    [
      { file: 'auto-trace.pdf', source, drawingNo: 'TRACE-1', ...A1 },
      { file: 'auto-trace.pdf', source, drawingNo: 'TRACE-2', ...A1 },
    ],
    {
      segments: [
        { id: 'seg_0', label: 'IS-00', colour: 1, drawingIds: [] },
        { id: 'seg_1', label: 'IS-01', colour: 2, drawingIds: [] },
        { id: 'seg_2', label: 'IS-02', colour: 3, drawingIds: [] },
      ],
      ...extra,
    },
  );
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('TRACE-1').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  return { dir, page };
}

const esdvs = [
  {
    id: 'mkr_a',
    drawingId: 'drw_seed0',
    shape: 'circle',
    geometry: { type: 'circle', cx: 600, cy: 600, r: 20 },
    esdv: { tag: 'ESDV-A', upstreamSegmentId: 'seg_0', downstreamSegmentId: 'seg_1' },
  },
  {
    id: 'mkr_b',
    drawingId: 'drw_seed0',
    shape: 'doubleLine',
    geometry: {
      type: 'doubleLine',
      points: [
        [1700, 575],
        [1700, 625],
      ],
      gap: 9.5,
    },
    esdv: { tag: 'ESDV-B', upstreamSegmentId: 'seg_1', downstreamSegmentId: 'seg_2' },
  },
];

const endFlange = {
  id: 'mkr_f',
  drawingId: 'drw_seed0',
  segmentId: 'seg_1',
  shape: 'endFlange',
  geometry: {
    type: 'doubleLine',
    points: [
      [1420, 1125],
      [1420, 1175],
    ],
    gap: 6,
  },
  endFlange: { tag: '', destination: 'closedDrain' },
};

const link = {
  id: 'lnk_1',
  sourceDrawingId: 'drw_seed0',
  rect: { x: 1240, y: 190, width: 120, height: 60 },
  targetDrawingId: 'drw_seed1',
  label: 'TO TRACE-2',
};

async function chooseSegment(page: Page, label: string) {
  await page
    .getByTestId('segment-list')
    .getByRole('button', { name: new RegExp(label) })
    .click();
}

test('auto trace highlights a segment out to its ESDVs, end flange and off-page connector', async ({
  app,
}) => {
  const { dir, page } = await open(app, 'auto-trace', {
    markers: [...esdvs, endFlange],
    links: [link],
  });
  await chooseSegment(page, 'IS-01');
  await expect(page.getByTestId('marker-list').locator('[data-shape="endFlange"]')).toHaveCount(1);
  // The segment panel lists the end flange among the segment's ends.
  await expect(page.getByTestId('segment-esdvs')).toContainText('End flangeClosed drain');

  // T takes the highlighter and traces IS-01 from its own ESDVs and end flange.
  await page.getByRole('application').focus();
  await page.keyboard.press('t');
  await expect(page.getByTestId('highlighter-bar')).toBeVisible();
  await expect(page.getByTestId('auto-trace')).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText(/Highlighted IS-01 out to 2 ESDVs, 1 end flange,? and 1 off-page connector/),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('It carries on on TRACE-2.', { exact: false })).toBeVisible();

  const project = await saved(app, dir);
  const paths = strokesOf(project, 'seg_1');
  const traced = paths.flat();
  expect(traced.length).toBeGreaterThan(4);
  // Along the pipe from ESDV A to ESDV B, and no further.
  expect(near(paths, 660, 600)).toBe(true);
  expect(near(paths, 1640, 600)).toBe(true);
  for (const [x] of traced) {
    expect(x).toBeGreaterThan(600);
    expect(x).toBeLessThan(1700);
  }
  // Down the branch and round the curve to the end flange, not into the drain header.
  expect(near(paths, 1000, 900)).toBe(true);
  expect(near(paths, 1044, 1106, 8)).toBe(true);
  expect(near(paths, 1350, 1150)).toBe(true);
  expect(traced.some(([x, y]) => x > 1420 && y > 900)).toBe(false);
  // Up to the off-page connector.
  expect(near(paths, 1300, 300)).toBe(true);
  expect(traced.some(([, y]) => y < 250)).toBe(false);
  // Straight over the crossing line, not along it.
  expect(traced.some(([x, y]) => Math.abs(x - 800) < 6 && Math.abs(y - 600) > 40)).toBe(false);

  // Nothing else was painted: not IS-00 or IS-02, and nothing unassigned.
  expect(
    project.markers.filter((m) => m.shape === 'highlighter' && m.segmentId !== 'seg_1'),
  ).toEqual([]);

  // Traced again, it has nothing new to paint.
  await page.getByTestId('auto-trace').click();
  await expect(page.getByTestId('auto-trace')).toHaveAttribute('aria-pressed', 'false');
  const before = strokePoints(await saved(app, dir), 'seg_1').length;
  await page.getByTestId('auto-trace').click();
  await expect(page.getByText('That pipework is highlighted already.')).toBeVisible({
    timeout: 20_000,
  });
  expect(strokePoints(await saved(app, dir), 'seg_1')).toHaveLength(before);

  // The toast opens the drawing the pipe carries on on. Both traces said so;
  // the newer toast is in front, over the older one. The pointer over the
  // stack spreads it out and moves the buttons, so the button is pressed with
  // the keyboard.
  await page
    .locator('[data-sonner-toast][data-front="true"]')
    .getByRole('button', { name: 'Open TRACE-2' })
    .press('Enter');
  await expect(page.getByRole('tab', { name: 'TRACE-2', selected: true })).toBeVisible();
  await app.removeDirectory(dir);
});

test('with auto trace on, a click traces the pipe; an end flange is placed across it', async ({
  app,
}) => {
  const { dir, page } = await open(app, 'auto-trace-click', { markers: esdvs });
  await chooseSegment(page, 'IS-00');

  // F picks the end flange tool; its bar says where the pipe goes.
  await page.getByRole('application').focus();
  await page.keyboard.press('f');
  await expect(page.getByTestId('end-flange-bar')).toBeVisible();
  await page.getByTestId('end-flange-flare').click();
  // A click on the drawn pipe puts the bar square across it.
  const at = await toScreen(page, 400, 601);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('end-flange-editor')).toBeVisible();
  await page.getByLabel('Tag').fill('FL-1');
  await page.getByRole('application').focus();
  let project = await saved(app, dir);
  const flange = project.markers.find((m) => m.shape === 'endFlange')!;
  expect(flange).toMatchObject({
    segmentId: 'seg_0',
    endFlange: { tag: 'FL-1', destination: 'flare' },
  });
  const [[x1, y1], [x2, y2]] = flange.geometry.points;
  // Across the pipe: upright, centred on it (to within a screen pixel at this zoom).
  expect(Math.abs(x1 - x2)).toBeLessThan(2);
  expect(Math.abs((y1 + y2) / 2 - 600)).toBeLessThan(4);
  expect(Math.abs(y1 - y2)).toBeGreaterThan(10);

  // IS-00 runs from the end flange to ESDV A: traced from its boundaries.
  await page.keyboard.press('t');
  await expect(page.getByText(/Highlighted IS-00 out to 1 ESDV and 1 end flange/)).toBeVisible({
    timeout: 20_000,
  });
  project = await saved(app, dir);
  expect(near(strokesOf(project, 'seg_0'), 500, 600)).toBe(true);
  const is00 = strokePoints(project, 'seg_0');
  for (const [x] of is00) {
    expect(x).toBeGreaterThan(400);
    expect(x).toBeLessThan(600);
  }

  // A click on the crossing line traces just that line, in the active segment.
  await chooseSegment(page, 'IS-02');
  await expect(page.getByTestId('auto-trace-status')).toBeVisible();
  const on = await toScreen(page, 800, 450);
  await page.mouse.click(on.x, on.y);
  await expect(page.getByText(/Highlighted IS-02 out to the ends of its lines/)).toBeVisible({
    timeout: 20_000,
  });
  const crossingPaths = strokesOf(await saved(app, dir), 'seg_2');
  const crossing = crossingPaths.flat();
  expect(near(crossingPaths, 800, 420)).toBe(true);
  expect(near(crossingPaths, 800, 780)).toBe(true);
  for (const [x] of crossing) expect(Math.abs(x - 800)).toBeLessThan(3);

  // Undo takes the whole trace back in one step.
  await page.keyboard.press('Control+z');
  expect(strokePoints(await saved(app, dir), 'seg_2')).toEqual([]);
  // Esc ends auto trace.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('auto-trace-status')).toHaveCount(0);
  await app.removeDirectory(dir);
});
