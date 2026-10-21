/**
 * The drawing list organised as the plant breakdown (DRW-11): a toggle
 * switches between all files and plant › unit › drawing. Units are added
 * from the plant, drawings are filed under them from their menu or by
 * dragging, and every change is one undo step saved in the project file.
 */
import { expect, test } from './fixtures';
import { closeProject, openMenu } from './helpers';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

interface Saved {
  plantUnits: { id: string; name: string }[];
  drawings: { drawingNo: string; unitId: string | null }[];
}

test('organises drawings by plant unit', async ({ app }) => {
  const dir = `plant-breakdown-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1010', ...A1 },
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1002', ...A1 },
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-2001', ...A1 },
    ],
    { facility: 'Gas plant' },
  );
  await openSeeded(app, dir);
  const page = app.page;
  const saved = async () => JSON.parse(await app.readText(dir, 'project.qrapc.json')) as Saved;
  const filed = async () =>
    Object.fromEntries((await saved()).drawings.map((d) => [d.drawingNo, d.unitId]));

  // All files is the default; the toggle switches to the plant breakdown.
  await expect(page.getByTestId('drawing-list')).toBeVisible();
  await page.getByRole('radio', { name: 'Organised by plant unit' }).click();
  const tree = page.getByTestId('drawing-tree');
  await expect(tree.getByRole('button', { name: 'Gas plant', exact: true })).toBeVisible();
  const unassigned = tree.locator('[data-unassigned]');
  await expect(unassigned.locator('li[data-drawing-id]')).toHaveCount(3);

  // Add two units from the plant.
  for (const name of ['Unit 200', 'Unit 100']) {
    await tree.getByRole('button', { name: 'Add unit' }).click();
    await page.getByTestId('unit-name').fill(name);
    await page.getByTestId('unit-name').press('Enter');
    await expect(tree.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  // A name another unit has is refused, and the field stays open to change it.
  await tree.getByRole('button', { name: 'Add unit' }).click();
  await page.getByTestId('unit-name').fill('unit 100');
  await page.getByTestId('unit-name').press('Enter');
  await expect(page.getByText('There is already a unit called unit 100.')).toBeVisible();
  await page.getByTestId('unit-name').press('Escape');
  await expect(page.getByTestId('unit-name')).toHaveCount(0);

  // Units are listed by name, numbers as numbers.
  const units = tree.locator('[data-unit-id]');
  await expect(units).toHaveCount(2);
  await expect(units.nth(0)).toContainText('Unit 100');
  await expect(units.nth(1)).toContainText('Unit 200');

  // File a drawing from its menu.
  await tree.locator('li[data-drawing-id]', { hasText: 'PEFS-1010' }).hover();
  await tree.getByRole('button', { name: 'Actions for PEFS-1010' }).click();
  await page.getByRole('menuitem', { name: 'Move to unit' }).click();
  await page.getByRole('menuitemradio', { name: 'Unit 100' }).click();
  await expect(units.nth(0).locator('li[data-drawing-id]')).toHaveText(/PEFS-1010/);

  // Drag another onto a unit.
  await tree
    .locator('li[data-drawing-id]', { hasText: 'PEFS-2001' })
    .dragTo(units.nth(1).getByRole('button', { name: /^Unit 200/ }));
  await expect(units.nth(1).locator('li[data-drawing-id]')).toHaveText(/PEFS-2001/);
  await expect(unassigned.locator('li[data-drawing-id]')).toHaveCount(1);

  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  const ids = Object.fromEntries((await saved()).plantUnits.map((u) => [u.name, u.id]));
  await expect
    .poll(filed)
    .toEqual({ 'PEFS-1010': ids['Unit 100'], 'PEFS-1002': null, 'PEFS-2001': ids['Unit 200'] });

  // Rename a unit in place; Undo puts the old name back.
  await units
    .nth(1)
    .getByRole('button', { name: /^Unit 200/ })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByTestId('unit-rename').fill('Unit 200 Compression');
  await page.getByTestId('unit-rename').press('Enter');
  await expect(units.nth(1)).toContainText('Unit 200 Compression');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(units.nth(1)).not.toContainText('Compression');

  // Closing a unit hides its drawings; the search finds them anyway.
  await units
    .nth(0)
    .getByRole('button', { name: /^Unit 100/ })
    .click();
  await expect(units.nth(0).locator('li[data-drawing-id]')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search drawings' }).fill('1010');
  await expect(tree.locator('li[data-drawing-id]')).toHaveText([/PEFS-1010/]);
  await page.getByRole('textbox', { name: 'Search drawings' }).fill('');
  await units
    .nth(0)
    .getByRole('button', { name: /^Unit 100/ })
    .click();
  await expect(units.nth(0).locator('li[data-drawing-id]')).toHaveCount(1);

  // Deleting a unit leaves its drawings unassigned.
  await units
    .nth(1)
    .getByRole('button', { name: /^Unit 200/ })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete unit' }).click();
  await expect(units).toHaveCount(1);
  await expect(unassigned.locator('li[data-drawing-id]')).toHaveCount(2);

  // The drawing register files drawings under units too.
  await openMenu(page, 'Drawing register');
  const register = page.getByTestId('drawing-register');
  await register.getByRole('combobox', { name: 'Unit PEFS-1002' }).click();
  await page.getByRole('option', { name: 'Unit 100' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing register' });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(units.nth(0).locator('li[data-drawing-id]')).toHaveCount(2);

  // The view is remembered in the browser, and the units in the project.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  await closeProject(page);
  const preferences = await page.evaluate(() => localStorage.getItem('qrapc.preferences'));
  expect(JSON.parse(preferences ?? '{}').state.drawingListView).toBe('organised');
  await openSeeded(app, dir);
  await expect(page.getByRole('radio', { name: 'Organised by plant unit' })).toBeChecked();
  await expect(
    page.getByTestId('drawing-tree').locator('[data-unit-id] li[data-drawing-id]'),
  ).toHaveCount(2);

  await app.removeDirectory(dir);
});
