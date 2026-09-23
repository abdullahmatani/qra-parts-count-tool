import { expect, test } from './fixtures';
import { closeProject, createProject } from './helpers';

test.describe('create and open projects (PRJ-01..03, PRJ-06)', () => {
  test('creates the folder structure and project file', async ({ app }) => {
    const dir = `create-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Gas plant QRA', client: 'ACME' });

    await expect(app.page.getByTestId('project-name')).toHaveText('Gas plant QRA');
    expect(await app.list(dir)).toEqual([
      '.backup',
      'cache',
      'drawings',
      'exports',
      'project.qrapc.json',
      'templates',
    ]);
    const saved = JSON.parse(await app.readText(dir, 'project.qrapc.json'));
    expect(saved).toMatchObject({
      schemaVersion: 1,
      name: 'Gas plant QRA',
      client: 'ACME',
      settings: { esdvBoundaryRule: 'upstream', flangeConvention: 'perJoint' },
    });
    await app.removeDirectory(dir);
  });

  test('requires the boundary rule and flange convention to be chosen (SEG-08)', async ({
    app,
  }) => {
    await app.open();
    await app.page.getByRole('button', { name: /New project/ }).click();
    const dialog = app.page.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabel('Project name').fill('No rules');
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(dialog.getByText('Choose where ESDVs on a boundary are counted.')).toBeVisible();
    await expect(dialog.getByText('Choose the flange counting convention.')).toBeVisible();
    await expect(dialog.getByText('Choose a working folder.')).toBeVisible();
  });

  test('closes and reopens a project from its folder and the recent list', async ({ app }) => {
    const dir = `reopen-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(dir);
    await app.pickDirectory(dir);
    await createProject(app.page, { name: 'Reopen me' });

    await closeProject(app.page);

    await expect(app.page.getByTestId('recent-projects')).toContainText('Reopen me');
    await app.page.getByTestId('recent-projects').getByText('Reopen me').click();
    await expect(app.page.getByTestId('project-name')).toHaveText('Reopen me');

    await closeProject(app.page);
    await app.pickDirectory(dir);
    await app.page.getByRole('button', { name: /Open project/ }).click();
    await expect(app.page.getByTestId('project-name')).toHaveText('Reopen me');
    await app.removeDirectory(dir);
  });

  test('reports a folder without a project and refuses to overwrite one', async ({ app }) => {
    const empty = `empty-${test.info().project.name}`;
    const existing = `existing-${test.info().project.name}`;
    await app.open();
    await app.removeDirectory(empty);
    await app.removeDirectory(existing);
    await app.writeText(empty, 'readme.txt', 'not a project');
    await app.pickDirectory(empty);
    await app.page.getByRole('button', { name: /Open project/ }).click();
    await expect(app.page.getByText('No project file was found in this folder.')).toBeVisible();

    await app.pickDirectory(existing);
    await createProject(app.page, { name: 'First' });
    await closeProject(app.page);
    await app.page.getByRole('button', { name: /New project/ }).click();
    const dialog = app.page.getByRole('dialog', { name: 'New project' });
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByLabel('Project name').fill('Second');
    await dialog.getByRole('radio', { name: /Both segments/ }).click();
    await dialog.getByRole('radio', { name: /Per flange face/ }).click();
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(dialog.getByText('This folder already contains a project.')).toBeVisible();
    const saved = JSON.parse(await app.readText(existing, 'project.qrapc.json'));
    expect(saved.name).toBe('First');
    await app.removeDirectory(empty);
    await app.removeDirectory(existing);
  });
});
