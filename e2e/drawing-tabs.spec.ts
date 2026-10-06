/**
 * Drawing tabs (DRW-06): many open drawings with long names overflow the tab
 * strip, which then scrolls sideways (with the mouse wheel too). The tabs are
 * never cut off and no scrollbar is drawn over them; the active tab stays in
 * view and the split-view button stays put.
 */
import { expect, test } from './fixtures';
import { openSeeded, seedProject } from './seed';

const A1 = { width: 2384, height: 1684 };

test('open drawing tabs stay whole when they overflow, and scroll sideways', async ({ app }) => {
  const dir = `drawing-tabs-${test.info().project.name}`;
  await app.open();
  const names = Array.from({ length: 10 }, (_, i) => `HWL-22-000000-PEFS-${1001 + i}`);
  await seedProject(
    app,
    dir,
    names.map((drawingNo) => ({ file: 'PEFS-1001_A1.pdf', drawingNo, ...A1 })),
  );
  await openSeeded(app, dir);
  const page = app.page;
  for (const name of names) {
    await page.getByTestId('drawing-list').getByText(name, { exact: true }).click();
  }

  const strip = page.getByTestId('drawing-tabs');
  await expect(strip.getByRole('tab')).toHaveCount(names.length);
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await strip.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');

  // The last drawing opened is the active tab, whole and in view.
  const active = strip.getByRole('tab', { name: names.at(-1) });
  await expect(active).toHaveAttribute('aria-selected', 'true');
  const stripBox = (await strip.boundingBox())!;
  const tabBox = (await active.locator('..').boundingBox())!;
  expect(tabBox.height).toBeGreaterThanOrEqual(32);
  expect(tabBox.y).toBeGreaterThanOrEqual(stripBox.y);
  expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(stripBox.y + stripBox.height + 0.5);
  expect(tabBox.x).toBeGreaterThanOrEqual(stripBox.x - 0.5);
  expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(stripBox.x + stripBox.width + 0.5);

  // The mouse wheel scrolls the tabs back to the first; the split button stays visible.
  await strip.hover();
  for (let i = 0; i < 8; i += 1) await page.mouse.wheel(0, -500);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(strip.getByRole('tab', { name: names[0] })).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Split view: two drawings side by side' }),
  ).toBeInViewport();
  await app.removeDirectory(dir);
});
