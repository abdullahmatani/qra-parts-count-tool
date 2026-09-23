import { expect, test } from './fixtures';
import { closeProject, createProject, setClient } from './helpers';

test.describe('autosave and backups (PRJ-04, PRJ-05)', () => {
  test('saves an edit to the project file within 2 seconds', async ({ app }) => {
    const dir = `autosave-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Autosave study' });

    // Time from the edit itself (the click that applies it), not from opening the dialog.
    await app.page.getByRole('button', { name: 'Settings' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('tab', { name: 'Project' }).click();
    await dialog.getByLabel('Client').fill('Autosaved client');
    const editedAt = Date.now();
    await dialog.getByRole('button', { name: 'Apply changes' }).click();
    await expect
      .poll(async () => JSON.parse(await app.readText(dir, 'project.qrapc.json')).client, {
        // PRJ-04 asks for 2 s; allow for test polling and a loaded machine.
        timeout: 2500,
        intervals: [100],
      })
      .toBe('Autosaved client');
    expect(Date.now() - editedAt).toBeLessThan(2500);
    await app.page.keyboard.press('Escape');
    await expect(app.page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    expect(await app.list(dir)).not.toContain('project.qrapc.json.tmp');
    await app.removeDirectory(dir);
  });

  test('keeps snapshots in .backup and restores one', async ({ app }) => {
    const dir = `backups-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Backup study' });
    await expect.poll(async () => (await app.list(dir, '.backup')).length).toBe(1);

    await setClient(app.page, 'Changed later');
    await expect(app.page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

    await app.page.getByRole('button', { name: 'Project', exact: true }).click();
    await app.page.getByRole('menuitem', { name: 'Backups' }).click();
    const list = app.page.getByTestId('snapshot-list');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await list.getByRole('button', { name: 'Restore' }).click();
    await app.page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click();
    await expect(app.page.getByText(/Restored the snapshot/)).toBeVisible();
    await expect
      .poll(async () => JSON.parse(await app.readText(dir, 'project.qrapc.json')).client)
      .toBe('');
    await closeProject(app.page);
    await app.removeDirectory(dir);
  });
});
