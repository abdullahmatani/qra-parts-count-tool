/**
 * Navigation aids (roadmap #56, #57): links suggested from drawing numbers in
 * the drawings' text (LNK-06), and DWG/DXF layer toggles (DRW-09).
 */
import { expect, test } from './fixtures';
import { createProject, importDrawings, openMenu, setStage } from './helpers';

test('suggests links from off-page connector text (LNK-06)', async ({ app }) => {
  const dir = `suggest-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();

  // Both connectors are linked already: nothing to suggest.
  await openMenu(page, 'Suggest drawing links…');
  const dialog = page.getByTestId('link-suggestions');
  await expect(dialog).toContainText('No new links found');
  await page.keyboard.press('Escape');

  // Remove the link on PEFS-S-001 (segment set-up), then ask again.
  await setStage(page, 'segments');
  await page.getByTestId('drawing-list').getByText('PEFS-S-001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  const link = page.getByTestId('drawing-link');
  await expect(link).toHaveCount(1);
  await page.getByRole('application').focus();
  await page.keyboard.press('l');
  const box = (await link.locator('rect').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('link-editor')).toBeVisible();
  await page.getByRole('application').focus();
  await page.keyboard.press('Delete');
  // The link leads to a drawing, so deleting it asks first.
  await page.getByTestId('delete-link-dialog').getByRole('button', { name: 'Delete link' }).click();
  await expect(link).toHaveCount(0);

  await openMenu(page, 'Suggest drawing links…');
  const suggestion = dialog.getByTestId('link-suggestion');
  await expect(suggestion).toHaveCount(1);
  await expect(suggestion).toContainText('PEFS-S-001');
  await expect(suggestion).toContainText('“TO PEFS-S-002”');
  await dialog.getByRole('button', { name: 'Add 1 link' }).click();
  await expect(dialog).toBeHidden();
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('data-status', 'ok');
  await app.removeDirectory(dir);
});

test('hides and shows DWG/DXF layers (DRW-09)', async ({ app }) => {
  const dir = `layers-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  await createProject(app.page, { name: 'Layer study' });
  const page = app.page;
  await importDrawings(page, ['PEFS-4001.dxf']);
  const picker = page.getByRole('dialog', { name: 'Choose drawings to import' });
  await picker.getByRole('button', { name: 'Import 1 drawing' }).click();
  const preview = page.getByTestId('viewer-preview-layer');
  await expect(preview).toBeVisible();
  const before = await preview.screenshot();

  const menu = page.getByTestId('layer-menu');
  await menu.click();
  const list = page.getByTestId('layer-list');
  await expect(list).toContainText('PIPE');
  await expect(list).toContainText('TEXT');
  await list.getByRole('checkbox', { name: 'PIPE' }).click();
  await expect(menu).toHaveText(/Layers \(1 hidden\)/);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  // The sheet is drawn again without the pipework.
  let hidden = before;
  await expect
    .poll(async () => {
      hidden = await preview.screenshot();
      return hidden.equals(before);
    })
    .toBe(false);

  await menu.click();
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(menu).toHaveText(/^Layers$/);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect.poll(async () => (await preview.screenshot()).equals(hidden)).toBe(false);
  await app.removeDirectory(dir);
});
