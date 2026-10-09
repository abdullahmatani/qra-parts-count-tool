/**
 * The equipment bar (type and shape of new markers), marker shapes (dot,
 * ring, square, free-form outline), Esc back to the Select tool, and deleting
 * drawing links (with a confirmation when the link leads somewhere).
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

const LIBRARY = {
  equipmentTypes: [
    { id: 'eqt_valve', name: 'Valve', category: 'valve', hasActuation: true, shortcut: '1' },
    { id: 'eqt_flange', name: 'Flange', category: 'flange', shortcut: '2' },
    { id: 'eqt_pipe', name: 'Pipe', category: 'pipe' },
  ],
};

async function open(app: AppFixture, name: string, extra: Record<string, unknown> = {}) {
  const dir = `equipment-${name}-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 },
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1002', ...A1 },
    ],
    { library: LIBRARY, ...extra },
  );
  await openSeeded(app, dir);
  const page = app.page;
  await page.getByTestId('drawing-list').getByText('PEFS-1001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  return { dir, page };
}

async function at(page: Page, fx: number, fy: number) {
  const box = (await page.getByRole('application').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function click(page: Page, fx: number, fy: number) {
  const p = await at(page, fx, fy);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, points: [number, number][]) {
  const [first, ...rest] = points;
  const start = await at(page, ...first!);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of rest) {
    const p = await at(page, ...point);
    await page.mouse.move(p.x, p.y, { steps: 6 });
  }
  await page.mouse.up();
}

const tool = (page: Page, name: string) =>
  page.getByTestId('toolbar').getByRole('radio', { name, exact: true });

/** The shape pressed in the equipment bar: the one markers are being placed with. */
const placing = (page: Page) =>
  page.getByTestId('equipment-bar').locator('[data-testid^="symbol-"][aria-checked="true"]');

interface Saved {
  markers: {
    id: string;
    geometry: { cx: number; cy: number; r: number };
    style: { symbol: string; outline: number[][] | null };
  }[];
  items: { markerId: string; equipmentTypeId: string | null; actuation: string | null }[];
  links: { id: string }[];
}

async function saved(app: AppFixture, dir: string): Promise<Saved> {
  await expect(app.page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  return JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
}

test('the equipment bar sets the type and shape of new markers; Esc returns to Select', async ({
  app,
}) => {
  // Counting, with pipe lengths: the dashed tool draws line runs.
  const { dir, page } = await open(app, 'bar', {
    stage: 'count',
    settings: {
      esdvBoundaryRule: 'upstream',
      flangeConvention: 'perJoint',
      pipeLengthCounting: true,
    },
  });
  const bar = page.getByTestId('equipment-bar');
  // Valves are offered per actuation; pipe is left to dashed line runs.
  await expect(bar.getByTestId('equipment-choice')).toHaveText([
    'Valve (manual)',
    'Valve (automated)',
    'Flange',
  ]);

  // The toolbar holds Select, Stamp and Line run; markers are placed with the bar's shapes.
  await expect(page.getByTestId('toolbar').getByRole('radio')).toHaveCount(3);
  await expect(tool(page, 'Line run')).toBeVisible();
  await expect(placing(page)).toHaveCount(0);

  // Choosing a type arms the remembered shape; the next marker is counted as it.
  await bar.getByRole('radio', { name: 'Valve (automated)' }).click();
  await expect(placing(page)).toHaveAttribute('data-testid', 'symbol-circle');
  await click(page, 0.3, 0.3);
  const editor = page.getByTestId('item-editor');
  await expect(editor.getByRole('combobox', { name: 'Equipment type' })).toHaveText(/Valve/);
  await expect(editor.getByRole('radio', { name: 'Automated' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Esc (on the drawing) goes back to the Select tool and keeps the selection;
  // a second Esc clears it.
  await page.getByRole('application').focus();
  await page.keyboard.press('Escape');
  await expect(tool(page, 'Select')).toHaveAttribute('aria-checked', 'true');
  await expect(placing(page)).toHaveCount(0);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);

  // Esc while a line run is being drawn cancels it and returns to Select.
  await page.keyboard.press('d');
  await click(page, 0.6, 0.6);
  const runHint = page.getByRole('status').filter({ hasText: 'Double-click' });
  await expect(runHint).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(runHint).toHaveCount(0);
  await expect(tool(page, 'Select')).toHaveAttribute('aria-checked', 'true');

  // Shapes: a square, a dot (smaller than a ring) and a free-form outline.
  await bar.getByRole('radio', { name: 'Flange' }).click();
  await bar.getByTestId('symbol-square').click();
  await expect(placing(page)).toHaveAttribute('data-testid', 'symbol-square');
  await click(page, 0.4, 0.3);
  await bar.getByTestId('symbol-dot').click();
  await click(page, 0.5, 0.3);
  await bar.getByTestId('symbol-freeform').click();
  // A click without a drag draws nothing and says how.
  await click(page, 0.6, 0.3);
  await expect(page.getByText('Drag around a symbol to draw a free-form outline.')).toBeVisible();
  await drag(page, [
    [0.6, 0.25],
    [0.65, 0.3],
    [0.6, 0.35],
    [0.55, 0.3],
    [0.6, 0.25],
  ]);
  const markers = page.getByTestId('marker');
  await expect(markers).toHaveCount(4);
  await expect(page.locator('[data-symbol="square"]')).toHaveCount(1);
  await expect(page.locator('[data-symbol="dot"]')).toHaveCount(1);
  await expect(page.locator('[data-symbol="freeform"]')).toHaveCount(1);

  const project = await saved(app, dir);
  const [valve, square, dot, outline] = project.markers;
  expect(project.items.find((i) => i.markerId === valve!.id)).toMatchObject({
    equipmentTypeId: 'eqt_valve',
    actuation: 'automated',
  });
  for (const m of [square, dot, outline]) {
    expect(project.items.find((i) => i.markerId === m!.id)?.equipmentTypeId).toBe('eqt_flange');
  }
  expect(square!.style).toEqual({ labelOffset: null, symbol: 'square', outline: null });
  expect(dot!.geometry.r).toBeLessThan(valve!.geometry.r);
  expect(outline!.style.symbol).toBe('freeform');
  expect(outline!.style.outline!.length).toBeGreaterThanOrEqual(3);

  // The panel changes the shape of a placed marker: the square becomes a ring.
  await page.getByRole('application').focus();
  await page.keyboard.press('Escape');
  await click(page, 0.4, 0.3);
  const inspector = page.getByTestId('marker-inspector');
  await expect(inspector).toContainText('Square');
  await inspector.getByTestId('marker-symbol-circle').click();
  await expect(page.locator('[data-symbol="square"]')).toHaveCount(0);
  await expect(page.locator('[data-symbol="circle"]')).toHaveCount(2);
  await app.removeDirectory(dir);
});

test('types that do not fit go in a More menu; the chosen type stays in the bar', async ({
  app,
}) => {
  const names = Array.from({ length: 12 }, (_, i) => `Long equipment type number ${i + 1}`);
  const { dir, page } = await open(app, 'more', {
    stage: 'count',
    library: {
      equipmentTypes: names.map((name, i) => ({ id: `eqt_${i}`, name, category: 'other' })),
    },
  });
  const bar = page.getByTestId('equipment-bar');
  const more = bar.getByTestId('equipment-more');
  const shown = bar.getByTestId('equipment-choice');
  await expect(more).toBeVisible();
  const visible = await shown.count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(names.length);
  await expect(more).toHaveText(`${names.length - visible} more`);

  // The last type, from the menu: it is chosen, arms the shape and stays in the bar.
  await more.click();
  await expect(page.getByTestId('equipment-more-choice')).toHaveCount(names.length - visible);
  await page.getByRole('menuitemradio', { name: names.at(-1) }).click();
  const last = bar.getByRole('radio', { name: names.at(-1) });
  await expect(last).toHaveAttribute('aria-checked', 'true');
  await expect(placing(page)).toHaveCount(1);

  // In a narrow window the More button is still whole, inside the bar.
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(last).toBeVisible();
  await expect
    .poll(async () => {
      const [b, m] = [(await bar.boundingBox())!, (await more.boundingBox())!];
      return m.x + m.width <= b.x + b.width;
    })
    .toBe(true);
  await app.removeDirectory(dir);
});

test('deletes an unlinked drawing link at once, and asks first for a linked one', async ({
  app,
}) => {
  const { dir, page } = await open(app, 'links');
  const links = page.getByTestId('drawing-link');

  // A link with no target yet: selectable with the Select tool, deleted with Delete.
  await page.getByRole('application').focus();
  await page.keyboard.press('l');
  await drag(page, [
    [0.2, 0.6],
    [0.3, 0.7],
  ]);
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute('data-status', 'noTarget');
  await page.getByRole('application').focus();
  await page.keyboard.press('Escape');
  await expect(tool(page, 'Select')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(links).toHaveAttribute('data-selected', 'false');
  await click(page, 0.25, 0.65);
  await expect(links).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('link-editor')).toContainText('no target drawing yet');
  await page.getByRole('application').focus();
  await page.keyboard.press('Delete');
  await expect(links).toHaveCount(0);
  await expect(page.getByTestId('delete-link-dialog')).toHaveCount(0);

  // A link to PEFS-1002: Delete asks first; Cancel keeps it, Delete link removes it.
  await page.keyboard.press('l');
  await drag(page, [
    [0.6, 0.6],
    [0.7, 0.7],
  ]);
  const editor = page.getByTestId('link-editor');
  await editor.getByRole('combobox', { name: 'Target drawing' }).click();
  await page.getByRole('option', { name: 'PEFS-1002' }).click();
  await expect(links).toHaveAttribute('data-status', 'ok');
  await page.getByRole('application').focus();
  await page.keyboard.press('Delete');
  const dialog = page.getByTestId('delete-link-dialog');
  await expect(dialog).toContainText('PEFS-1002');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(links).toHaveCount(1);
  await editor.getByRole('button', { name: 'Delete link' }).click();
  await dialog.getByRole('button', { name: 'Delete link' }).click();
  await expect(links).toHaveCount(0);
  expect((await saved(app, dir)).links).toEqual([]);

  // Undo brings it back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(links).toHaveCount(1);
  await app.removeDirectory(dir);
});
