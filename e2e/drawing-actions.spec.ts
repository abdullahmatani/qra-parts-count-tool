/**
 * Renaming and deleting drawings from the drawing list (DRW-04): the ⋯ menu
 * (or a right-click) on a drawing renames it in place or deletes it after a
 * confirmation; F2 renames the focused drawing. Both can be undone.
 */
import { expect, test } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

test('renames and deletes drawings from the drawing list', async ({ app }) => {
  const dir = `drawing-actions-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1001', ...A1 },
      { file: 'PEFS-1001_A1.pdf', drawingNo: 'PEFS-1002', ...A1 },
    ],
    {
      markers: [
        {
          id: 'mkr_1',
          drawingId: 'drw_seed1',
          shape: 'circle',
          geometry: { type: 'circle', cx: 500, cy: 500, r: 12 },
        },
      ],
      items: [{ id: 'itm_1', seq: 1, markerId: 'mkr_1', drawingId: 'drw_seed1' }],
      nextItemSeq: 2,
    },
  );
  await openSeeded(app, dir);
  const page = app.page;
  const list = page.getByTestId('drawing-list');
  const rows = list.locator('li[data-drawing-id]');
  await expect(rows).toHaveCount(2);

  // Rename from the menu: the name is edited in place; Enter keeps it.
  await rows.first().hover();
  await list.getByRole('button', { name: 'Actions for PEFS-1001' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const field = list.getByTestId('drawing-rename');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('PEFS-1001');
  await field.fill('PEFS-1001-A');
  await field.press('Enter');
  await expect(list.getByText('PEFS-1001-A', { exact: true })).toBeVisible();

  // F2 renames the focused drawing; Esc leaves the name as it was.
  await list.getByRole('button', { name: /^PEFS-1002/ }).focus();
  await page.keyboard.press('F2');
  await expect(field).toBeFocused();
  await field.fill('discarded');
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(list.getByRole('button', { name: /^PEFS-1002/ })).toBeFocused();
  await expect(list.getByText('PEFS-1002', { exact: true })).toBeVisible();

  // Delete from a right-click: the confirmation says what goes with it.
  await list.getByText('PEFS-1002', { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete PEFS-1002?' });
  await expect(confirm).toContainText('Its marker and count item are deleted too.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(rows).toHaveCount(2);

  await rows.nth(1).hover();
  await list.getByRole('button', { name: 'Actions for PEFS-1002' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await confirm.getByRole('button', { name: 'Delete drawing' }).click();
  await expect(confirm).toBeHidden();
  await expect(rows).toHaveCount(1);

  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 10_000,
  });
  const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json')) as {
    drawings: { drawingNo: string }[];
    markers: unknown[];
    items: unknown[];
  };
  expect(saved.drawings.map((d) => d.drawingNo)).toEqual(['PEFS-1001-A']);
  expect(saved.markers).toEqual([]);
  expect(saved.items).toEqual([]);

  // Undo brings the drawing back with its marker.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(2);
  await app.removeDirectory(dir);
});
