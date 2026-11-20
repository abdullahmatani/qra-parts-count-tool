/**
 * The quick-pick wheel (count stage: right-click to pick the type of the
 * symbol under the pointer), counting with a type's key pressed over a
 * symbol, and the drawing canvas's right-click menu.
 */
import type { Page } from '@playwright/test';
import { expect, test, type AppFixture } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

const LIBRARY = {
  equipmentTypes: [
    { id: 'eqt_valve', name: 'Valve', category: 'valve', hasActuation: true, shortcut: '1' },
    { id: 'eqt_flange', name: 'Flange', category: 'flange', shortcut: '2' },
    // No key: not on the wheel.
    { id: 'eqt_vessel', name: 'Pressure vessel', category: 'vessel' },
  ],
};

async function open(app: AppFixture, name: string) {
  const dir = `quick-pick-${name}-${test.info().project.name}`;
  await app.open();
  await seedProject(app, dir, [{ file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 }], {
    library: LIBRARY,
    stage: 'count',
  });
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

/** The point `distance` px from `p` towards wedge `index` of `count` (clockwise from the top). */
function towards(p: { x: number; y: number }, index: number, count: number, distance = 60) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { x: p.x + Math.cos(angle) * distance, y: p.y + Math.sin(angle) * distance };
}

interface Saved {
  markers: { id: string; geometry: { cx: number; cy: number } }[];
  items: { markerId: string; equipmentTypeId: string | null; actuation: string | null }[];
}

async function saved(app: AppFixture, dir: string): Promise<Saved> {
  await expect(app.page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  return JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
}

const typeOf = (project: Saved, markerId: string) => {
  const item = project.items.find((i) => i.markerId === markerId);
  return item && [item.equipmentTypeId, item.actuation];
};

test('right-click opens the quick-pick wheel; flicking at a type places it', async ({ app }) => {
  const { dir, page } = await open(app, 'wheel');
  const bar = page.getByTestId('equipment-bar');
  await bar.getByTestId('symbol-circle').click();
  const wheel = page.getByTestId('quick-pick-wheel');
  const choices = wheel.getByTestId('quick-pick-choice');
  const markers = page.getByTestId('marker');
  const menu = page.getByTestId('canvas-context-menu');

  // Right button down on the paper: the wheel opens round the pointer with the
  // keyed types and their keys; the context menu does not.
  const a = await at(page, 0.3, 0.3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'right' });
  await expect(choices.first()).toBeVisible();
  await expect(choices.locator('span')).toHaveText([
    'Valve (manual)',
    'Valve (automated)',
    'Flange',
  ]);
  await expect(wheel.getByTestId('quick-pick-key')).toHaveText(['1', 'Shift+1', '2']);
  // Towards the flange (the third of three wedges, down-left) and let go.
  const flange = towards(a, 2, 3);
  await page.mouse.move(flange.x, flange.y, { steps: 5 });
  await expect(choices.nth(2)).toHaveAttribute('data-active', 'true');
  await page.mouse.up({ button: 'right' });
  await expect(wheel).toHaveCount(0);
  await expect(menu).toHaveCount(0);
  await expect(markers).toHaveCount(1);
  // The pick is what the next markers count, as in the equipment bar.
  await expect(
    bar.locator('[data-testid="equipment-choice"][aria-checked="true"]'),
  ).toHaveAttribute('data-type-id', 'eqt_flange');

  // A right-click (let go in the middle) keeps the wheel open, and a click on a type places it.
  const b = await at(page, 0.5, 0.3);
  await page.mouse.click(b.x, b.y, { button: 'right' });
  await expect(wheel).toHaveAttribute('data-sticky', 'true');
  await expect(menu).toHaveCount(0);
  const automated = towards(b, 1, 3);
  await page.mouse.move(automated.x, automated.y, { steps: 5 });
  await expect(choices.nth(1)).toHaveAttribute('data-active', 'true');
  await page.mouse.down();
  await page.mouse.up();
  await expect(wheel).toHaveCount(0);
  await expect(markers).toHaveCount(2);

  // Esc closes the wheel without placing anything, and the tool stays.
  const c = await at(page, 0.7, 0.3);
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await expect(choices.first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(wheel).toHaveCount(0);
  await expect(markers).toHaveCount(2);
  await expect(bar.getByTestId('symbol-circle')).toHaveAttribute('aria-checked', 'true');

  // A second right-click on an open wheel gives the context menu instead.
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await expect(wheel).toHaveAttribute('data-sticky', 'true');
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await expect(wheel).toHaveCount(0);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // A plain left click still places the type chosen in the bar, without the wheel.
  await page.mouse.click(c.x, c.y);
  await expect(markers).toHaveCount(3);
  await expect(wheel).toHaveCount(0);

  const project = await saved(app, dir);
  const [first, second, third] = project.markers;
  expect(typeOf(project, first!.id)?.[0]).toBe('eqt_flange');
  expect(typeOf(project, second!.id)).toEqual(['eqt_valve', 'automated']);
  expect(typeOf(project, third!.id)).toEqual(['eqt_valve', 'automated']);
  await app.removeDirectory(dir);
});

test('point at a symbol and press its key to count it (Shift for automated)', async ({ app }) => {
  const { dir, page } = await open(app, 'keys');
  await page.getByTestId('equipment-bar').getByTestId('symbol-circle').click();
  await page.getByRole('application').focus();
  const markers = page.getByTestId('marker');
  const size = page.getByTestId('item-editor').getByLabel('Size', { exact: true });
  const pointAt = async (fx: number, fy: number) => {
    const p = await at(page, fx, fy);
    await page.mouse.move(p.x, p.y, { steps: 3 });
  };

  // Each key press places a marker under the pointer, keeping the keyboard on the drawing.
  await pointAt(0.3, 0.4);
  await page.keyboard.press('2');
  await expect(markers).toHaveCount(1);
  await expect(size).not.toBeFocused();
  await pointAt(0.45, 0.4);
  await page.keyboard.press('Shift+Digit1');
  await expect(markers).toHaveCount(2);
  await pointAt(0.6, 0.4);
  await page.keyboard.press('1');
  await expect(markers).toHaveCount(3);

  // Over a marker, the key changes what it counts and opens its size.
  await pointAt(0.3, 0.4);
  await page.keyboard.press('Shift+Digit1');
  await expect(markers).toHaveCount(3);
  await expect(size).toBeFocused();

  const project = await saved(app, dir);
  const [first, second, third] = project.markers;
  expect(typeOf(project, first!.id)).toEqual(['eqt_valve', 'automated']);
  expect(typeOf(project, second!.id)).toEqual(['eqt_valve', 'automated']);
  expect(typeOf(project, third!.id)).toEqual(['eqt_valve', 'manual']);
  await app.removeDirectory(dir);
});

test('the canvas right-click menu edits, copies, pastes and deletes markers', async ({ app }) => {
  const { dir, page } = await open(app, 'menu');
  // Flange (key 2), placed with a ring.
  await page.getByRole('application').focus();
  await page.keyboard.press('2');
  await page.getByTestId('equipment-bar').getByTestId('symbol-circle').click();
  const markers = page.getByTestId('marker');
  const a = await at(page, 0.3, 0.3);
  await page.mouse.click(a.x, a.y);
  await expect(markers).toHaveCount(1);
  await page.getByRole('application').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);

  // Right-click on the marker selects it, and the menu acts on it.
  const menu = page.getByTestId('canvas-context-menu');
  await page.mouse.click(a.x, a.y, { button: 'right' });
  await expect(menu).toBeVisible();
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
  await expect(menu.getByTestId('context-paste')).toHaveAttribute('data-disabled', '');

  // Count as: the flange becomes a manual valve.
  await menu.getByTestId('context-count-as').click();
  await page.getByRole('menuitemradio', { name: 'Valve (manual)' }).click();
  await expect(menu).toHaveCount(0);
  let project = await saved(app, dir);
  expect(typeOf(project, project.markers[0]!.id)).toEqual(['eqt_valve', 'manual']);

  // Copy, then paste where the drawing is right-clicked. While counting, a
  // right-click on the paper opens the quick-pick wheel: Shift gives the menu.
  await page.mouse.click(a.x, a.y, { button: 'right' });
  await menu.getByTestId('context-copy').click();
  const b = await at(page, 0.6, 0.5);
  const menuAt = async (p: { x: number; y: number }) => {
    await page.keyboard.down('Shift');
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.keyboard.up('Shift');
  };
  await menuAt(b);
  await menu.getByTestId('context-paste').click();
  await expect(markers).toHaveCount(2);
  project = await saved(app, dir);
  const pasted = project.markers[1]!;
  expect(pasted.geometry.cx).toBeGreaterThan(project.markers[0]!.geometry.cx);
  expect(typeOf(project, pasted.id)).toEqual(['eqt_valve', 'manual']);

  // Delete the pasted marker (selected after the paste), then undo it from the menu.
  await page.mouse.click(b.x, b.y, { button: 'right' });
  await menu.getByTestId('context-delete').click();
  await expect(markers).toHaveCount(1);
  await menuAt(b);
  await menu.getByTestId('context-undo').click();
  await expect(markers).toHaveCount(2);

  // Cut (Ctrl+X) removes the selection and keeps it to paste.
  await page.mouse.click(b.x, b.y, { button: 'right' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('Control+x');
  await expect(markers).toHaveCount(1);
  await menuAt(b);
  await menu.getByTestId('context-paste').click();
  await expect(markers).toHaveCount(2);

  // The Tool submenu switches tools.
  await menuAt(b);
  await menu.getByTestId('context-tool').click();
  await page.getByRole('menuitemradio', { name: /^Stamp/ }).click();
  await expect(
    page.getByTestId('toolbar').getByRole('radio', { name: 'Stamp', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await app.removeDirectory(dir);
});
