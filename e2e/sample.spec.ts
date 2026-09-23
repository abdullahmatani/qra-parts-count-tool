/**
 * The sample project (roadmap #46): created from the start screen into an
 * empty folder, opened with its drawings, count, notes and links.
 */
import { expect, test } from './fixtures';

test('creates and opens the sample project from the start screen', async ({ app }) => {
  const dir = `sample-${test.info().project.name}`;
  await app.open();
  await app.removeDirectory(dir);
  await app.pickDirectory(dir);
  const page = app.page;
  await page.getByRole('button', { name: /Try the sample project/ }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByText('The sample project is ready.')).toBeVisible();

  await expect(page.getByTestId('segment-list').getByRole('button')).toHaveCount(2);
  await page.getByTestId('drawing-list').getByText('PEFS-S-001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await expect(page.getByTestId('marker')).toHaveCount(17);
  await expect(page.getByTestId('drawing-link')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('sample.png') });

  // The open query shows in the pre-export check.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog.getByTestId('check-issue')).toHaveCount(1);
  await expect(dialog.getByTestId('check-issue')).toContainText(
    '1 item is missing its type or size',
  );
  await page.keyboard.press('Escape');

  const files = await app.list(dir, 'drawings');
  expect(files).toEqual(['PEFS-S-001_002_sample.pdf']);
  await app.removeDirectory(dir);
});
