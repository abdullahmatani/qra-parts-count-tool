import { expect, test } from '@playwright/test';

// NFR-01: works with no network after first load.
test.describe('offline operation (NFR-01)', () => {
  test('the app reloads from the service-worker cache with the network off', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'QRA Parts Count Tool' })).toBeVisible();

    // Wait until the service worker has installed, precached every asset and
    // taken control of the page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          }),
        );
      }
    });

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'QRA Parts Count Tool' })).toBeVisible();

    // Every precached asset must be served without the network.
    const failed: string[] = [];
    page.on('requestfailed', (request) => failed.push(request.url()));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'QRA Parts Count Tool' })).toBeVisible();
    expect(failed).toEqual([]);
  });
});
