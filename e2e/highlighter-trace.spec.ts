/**
 * The highlighter's line magnet: dragged roughly along a drawn line, a stroke
 * comes out on the line, round its corners and curves, shown dashed while it
 * is dragged. It works on PDF and CAD drawings alike; Follow lines turns it off.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { expect, test } from './fixtures';
import { createProject, toScreen } from './helpers';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

interface Saved {
  markers: { shape: string; geometry: { points: [number, number][] } }[];
}

async function savedStrokes(
  app: { readText(dir: string, path: string): Promise<string> },
  dir: string,
  page: Page,
) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
  return saved.markers.filter((m) => m.shape === 'highlighter').map((m) => m.geometry.points);
}

/** Drawing units per screen pixel, from the overlay's transform. */
async function unitsPerPixel(page: Page): Promise<number> {
  const a = await toScreen(page, 0, 0);
  const b = await toScreen(page, 100, 0);
  return 100 / Math.hypot(b.x - a.x, b.y - a.y);
}

/** Presses, drags through `via` (page px) and returns before letting go. */
async function press(page: Page, via: { x: number; y: number }[]) {
  const [first, ...rest] = via;
  await page.mouse.move(first!.x, first!.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 12 });
}

function distanceToSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

test('follows drawn lines round a corner and a curve on a PDF drawing', async ({ app }) => {
  // A1 sheet: an L-shaped pipe with its corner at (1500, 500), and a circle.
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([A1.width, A1.height]);
  const up = (y: number) => A1.height - y;
  const black = rgb(0, 0, 0);
  sheet.drawLine({
    start: { x: 500, y: up(500) },
    end: { x: 1500, y: up(500) },
    thickness: 3,
    color: black,
  });
  sheet.drawLine({
    start: { x: 1500, y: up(500) },
    end: { x: 1500, y: up(1100) },
    thickness: 3,
    color: black,
  });
  sheet.drawCircle({ x: 800, y: up(1150), size: 200, borderWidth: 3, borderColor: black });
  const file = test.info().outputPath('trace.pdf');
  writeFileSync(file, await pdf.save());

  const dir = `highlighter-trace-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [{ file: 'trace.pdf', source: pathToFileURL(file), drawingNo: 'TRACE-1', ...A1 }],
    { segments: [{ id: 'seg_1', label: 'IS-01', colour: 1, drawingIds: [] }] },
  );
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('TRACE-1').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await page.getByTestId('segment-list').getByRole('button', { name: /IS-01/ }).click();
  await page.getByRole('application').focus();
  await page.keyboard.press('h');
  const follow = page.getByTestId('highlighter-follow-lines');
  await expect(follow).toHaveAttribute('aria-pressed', 'true');

  const upp = await unitsPerPixel(page);
  // A hand that wanders up to 5 px either side of the pipe and cuts its corner.
  const off = (x: number, y: number, dx: number, dy: number) =>
    toScreen(page, x + dx * upp, y + dy * upp);
  await press(page, [
    await off(530, 500, 0, 4),
    await off(800, 500, 0, -5),
    await off(1100, 500, 0, 5),
    await off(1380, 500, 0, -4),
    await off(1478, 522, 0, 0),
    await off(1500, 700, 5, 0),
    await off(1500, 900, -5, 0),
    await off(1500, 1060, 4, 0),
  ]);
  // While dragging, the traced path shows dashed, holding on to the line.
  await expect(page.getByTestId('trace')).toBeVisible();
  await expect(page.getByTestId('trace-end')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('trace')).toHaveCount(0);

  let strokes = await savedStrokes(app, dir, page);
  expect(strokes).toHaveLength(1);
  const pipe: [number, number][] = [
    [500, 500],
    [1500, 500],
    [1500, 1100],
  ];
  const offPipe = (p: [number, number]) =>
    Math.min(distanceToSegment(p, pipe[0]!, pipe[1]!), distanceToSegment(p, pipe[1]!, pipe[2]!));
  // Every point is on the pipe, within two screen pixels, and the stroke turns its corner.
  for (const p of strokes[0]!) expect(offPipe(p)).toBeLessThanOrEqual(2 * upp);
  const corner = Math.min(...strokes[0]!.map((p) => Math.hypot(p[0] - 1500, p[1] - 500)));
  expect(corner).toBeLessThanOrEqual(2 * upp);

  // Round the circle, with the hand in and out of it.
  const around: { x: number; y: number }[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const angle = Math.PI * (1.1 + (0.8 * i) / 10);
    const r = 200 + (i % 2 ? 5 : -5) * upp;
    around.push(await toScreen(page, 800 + r * Math.cos(angle), 1150 + r * Math.sin(angle)));
  }
  await press(page, around);
  await page.mouse.up();
  strokes = await savedStrokes(app, dir, page);
  expect(strokes).toHaveLength(2);
  const arc = strokes[1]!;
  expect(arc.length).toBeGreaterThan(6);
  for (const [x, y] of arc) {
    expect(Math.abs(Math.hypot(x - 800, y - 1150) - 200)).toBeLessThanOrEqual(2 * upp);
  }

  // With Follow lines off, the stroke follows the hand.
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await press(page, [
    await off(600, 500, 0, 8),
    await off(900, 500, 0, -8),
    await off(1200, 500, 0, 8),
  ]);
  await expect(page.getByTestId('trace')).toHaveCount(0);
  await expect(page.getByTestId('draft')).toBeVisible();
  await page.mouse.up();
  strokes = await savedStrokes(app, dir, page);
  expect(Math.max(...strokes[2]!.map(offPipe))).toBeGreaterThan(5 * upp);
  await app.removeDirectory(dir);
});

test('follows drawn lines on a DXF drawing', async ({ app }) => {
  // An L of two lines in model space (y up): along the top, then down the right.
  const dxf = [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '0',
    '20',
    '300',
    '30',
    '0',
    '11',
    '400',
    '21',
    '300',
    '31',
    '0',
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '400',
    '20',
    '300',
    '30',
    '0',
    '11',
    '400',
    '21',
    '0',
    '31',
    '0',
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
  ].join('\n');
  const file = test.info().outputPath('trace.dxf');
  writeFileSync(file, dxf);

  const dir = `highlighter-trace-dxf-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  await createProject(app.page, { name: 'Trace study' });
  const page = app.page;
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import drawings' }).first().click();
  await (await chooser).setFiles(file);
  await page
    .getByRole('dialog', { name: 'Choose drawings to import' })
    .getByRole('button', { name: 'Import 1 drawing' })
    .click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();

  // Where the L is drawn: the box round the lines of the sheet (CAD hairlines, faint
  // where anti-aliased).
  const box = await page
    .getByTestId('viewer-preview-layer')
    .evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')!;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const p = (y * width + x) * 4;
          if (data[p + 3]! > 200 && Math.min(data[p]!, data[p + 1]!, data[p + 2]!) < 220) {
            [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
          }
        }
      }
      const rect = canvas.getBoundingClientRect();
      const k = rect.width / width;
      return {
        x0: rect.left + x0 * k,
        y0: rect.top + y0 * k,
        x1: rect.left + x1 * k,
        y1: rect.top + y1 * k,
      };
    });
  expect(box.x1 - box.x0).toBeGreaterThan(100);

  await page.getByRole('application').focus();
  await page.keyboard.press('h');
  const { x0, y0, x1, y1 } = box;
  await press(page, [
    { x: x0 + 15, y: y0 + 4 },
    { x: (x0 + x1) / 2, y: y0 - 5 },
    { x: x1 - 12, y: y0 + 9 },
    { x: x1 + 5, y: (y0 + y1) / 2 },
    { x: x1 - 4, y: y1 - 12 },
  ]);
  await expect(page.getByTestId('trace-end')).toBeVisible();
  await page.mouse.up();

  // Every point of the stroke lies on the drawn lines.
  const [stroke] = await savedStrokes(app, dir, page);
  expect(stroke!.length).toBeGreaterThanOrEqual(3);
  for (const [x, y] of stroke!) {
    const p = await toScreen(page, x, y);
    const ink = await page
      .getByTestId('viewer-preview-layer')
      .evaluate((canvas: HTMLCanvasElement, at) => {
        const rect = canvas.getBoundingClientRect();
        const k = canvas.width / rect.width;
        const cx = Math.round((at.x - rect.left) * k);
        const cy = Math.round((at.y - rect.top) * k);
        const r = Math.ceil(2 * k);
        const { data } = canvas
          .getContext('2d')!
          .getImageData(cx - r, cy - r, 2 * r + 1, 2 * r + 1);
        let darkest = 255;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! > 200) darkest = Math.min(darkest, data[i]!, data[i + 1]!, data[i + 2]!);
        }
        return darkest;
      }, p);
    expect(ink, `${x},${y}`).toBeLessThan(220);
  }
  // It turns the corner rather than cutting it.
  const corner = { x: x1, y: y0 };
  const nearest = Math.min(
    ...(await Promise.all(stroke!.map(async ([x, y]) => toScreen(page, x, y)))).map((p) =>
      Math.hypot(p.x - corner.x, p.y - corner.y),
    ),
  );
  expect(nearest).toBeLessThan(3);
  await app.removeDirectory(dir);
});

test('a traced stroke let go at an ESDV stops there, with nothing past it', async ({ app }) => {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([A1.width, A1.height]);
  sheet.drawLine({
    start: { x: 300, y: A1.height - 600 },
    end: { x: 2000, y: A1.height - 600 },
    thickness: 3,
    color: rgb(0, 0, 0),
  });
  const file = test.info().outputPath('esdv.pdf');
  writeFileSync(file, await pdf.save());

  const dir = `highlighter-trace-esdv-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [{ file: 'esdv.pdf', source: pathToFileURL(file), drawingNo: 'TRACE-2', ...A1 }],
    {
      markers: [
        {
          id: 'mkr_esdv',
          drawingId: 'drw_seed0',
          shape: 'circle',
          geometry: { type: 'circle', cx: 1200, cy: 600, r: 20 },
          esdv: {},
        },
      ],
    },
  );
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('TRACE-2').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await page.getByRole('application').focus();
  await page.keyboard.press('h');

  const upp = await unitsPerPixel(page);
  // Along the pipe to the ESDV, let go just past it: within its magnet.
  await press(page, [
    await toScreen(page, 500, 600 + 4 * upp),
    await toScreen(page, 900, 600 - 4 * upp),
    await toScreen(page, 1200 + 20 + 8 * upp, 600 + 3 * upp),
  ]);
  await expect(page.getByTestId('esdv-snap')).toBeVisible();
  await page.mouse.up();

  const strokes = await savedStrokes(app, dir, page);
  expect(strokes).toHaveLength(1);
  const xs = strokes[0]!.map(([x]) => x);
  expect(Math.max(...xs)).toBeLessThanOrEqual(1200);
  for (const [, y] of strokes[0]!) expect(Math.abs(y - 600)).toBeLessThanOrEqual(2 * upp);
  await app.removeDirectory(dir);
});
