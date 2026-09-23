import { expect, test } from './fixtures';

test.describe('app shell', () => {
  test('shows the start screen with new and open project actions', async ({ app }) => {
    await app.open();
    const start = app.page.getByTestId('start-screen');
    await expect(start).toBeVisible();
    await expect(start.getByRole('button', { name: /New project/ })).toBeVisible();
    await expect(start.getByRole('button', { name: /Open project/ })).toBeVisible();
    // Chromium supports the File System Access API, so there is no unsupported notice.
    await expect(start.getByRole('alert')).toHaveCount(0);
  });

  test('the folder picker stand-in returns a writable OPFS folder', async ({ app }) => {
    await app.open();
    await app.pickDirectory('e2e-harness');
    const written = await app.page.evaluate(async () => {
      const dir = await window.showDirectoryPicker();
      const file = await dir.getFileHandle('probe.txt', { create: true });
      const writable = await file.createWritable();
      await writable.write('ok');
      await writable.close();
      return dir.name;
    });
    expect(written).toBe('e2e-harness');
    expect(await app.readText('e2e-harness', 'probe.txt')).toBe('ok');
    expect(await app.list('e2e-harness')).toEqual(['probe.txt']);
    await app.removeDirectory('e2e-harness');
  });
});
