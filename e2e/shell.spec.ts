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

  test('says it is free software under the GPL, with its source and licences (GPL-3.0)', async ({
    app,
  }) => {
    await app.open();
    const page = app.page;
    await expect(page.getByTestId('start-screen')).toContainText(
      'Free software under the GNU GPL v3 or later.',
    );
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('tab', { name: 'About' }).click();
    const licence = dialog.getByTestId('about-licence');
    await expect(licence).toContainText('GNU General Public License, version 3 or later');
    await expect(licence.getByRole('link', { name: 'Source code' })).toHaveAttribute(
      'href',
      'https://github.com/abdullahmatani/qra-parts-count-tool',
    );
    // The licence texts are part of the app, so they are there offline too.
    for (const [name, text] of [
      ['GNU GPL v3', 'GNU GENERAL PUBLIC LICENSE'],
      ['Third-party licences', '@mlightcad/libredwg-web'],
    ] as const) {
      const href = await licence.getByRole('link', { name }).getAttribute('href');
      const body = await page.evaluate(async (url) => (await fetch(url!)).text(), href);
      expect(body).toContain(text);
    }
  });
});
