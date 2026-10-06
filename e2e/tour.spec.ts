/**
 * The guided tour (onboarding): started from the start screen, it opens a
 * practice project in memory and walks through one complete parts count,
 * ticking off each step as the user does it with the real tools.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickDrawing, dismissToasts, toScreen } from './helpers';

const near = (p: { x: number; y: number }, x: number, y: number, d = 6) =>
  Math.abs(p.x - x) <= d && Math.abs(p.y - y) <= d;

async function dragDrawing(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

/** Chooses an equipment type in the equipment bar, or in its More menu when it is not shown. */
async function chooseEquipment(page: Page, name: string) {
  const bar = page.getByTestId('equipment-bar');
  const button = bar.getByRole('radio', { name, exact: true });
  if (await button.isVisible()) {
    await button.click();
  } else {
    await bar.getByTestId('equipment-more').click();
    // The menu names a type with its key, e.g. "Flange 2".
    const escaped = name.replace(/[()]/g, '\\$&');
    await page.getByRole('menuitemradio', { name: new RegExp(`^${escaped}( \\d)?$`) }).click();
  }
  await expect(bar.getByRole('radio', { name, exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
}

async function key(page: Page, keys: string) {
  await page.getByRole('application').focus();
  await page.keyboard.press(keys);
}

test('walks through one complete parts count on the practice project', async ({ app }) => {
  test.setTimeout(240_000);
  await app.open();
  const page = app.page;
  const card = page.getByTestId('tour-card');
  const shot = (name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  const atStep = (id: string) => expect(card).toHaveAttribute('data-step', id, { timeout: 20_000 });
  const next = () => card.getByRole('button', { name: /^Next/ }).click();

  // The tour needs no folder: the practice project lives in the tab.
  await page.getByRole('button', { name: /Take the guided tour/ }).click();
  await atStep('welcome');
  await expect(page.getByTestId('practice-badge')).toBeVisible();
  await expect(page.getByTestId('project-name')).toHaveText('Guided tour - inlet separator');
  await shot('01-welcome');
  await card.getByRole('button', { name: /Start the tour/ }).click();

  await atStep('openDrawing');
  await expect(page.getByTestId('tour-spotlight')).toBeVisible();
  await page.getByTestId('drawing-list').getByText('PEFS-S-001').click();
  await expect(page.getByTestId('viewer-preview-layer')).toBeVisible();
  await atStep('navigate');
  await next();

  await atStep('findText');
  await key(page, 'Control+f');
  await page.getByTestId('find-bar').getByLabel('Find text on the drawing').fill('ESDV');
  await atStep('createSegment');
  await page.keyboard.press('Escape');

  await page.getByTestId('left-pane').getByRole('button', { name: 'Segment' }).click();
  const dialog = page.getByRole('dialog', { name: 'New segment' });
  await dialog.getByLabel('Label').fill('IS-01');
  await dialog.getByLabel('Fluid').fill('Gas / condensate');
  await dialog.getByRole('button', { name: 'Create segment' }).click();
  await expect(dialog).toBeHidden();

  // ESDVs: the step rings ESDV-101 on the sheet.
  await atStep('esdv');
  await expect(page.getByTestId('tour-hints')).toBeVisible();
  await shot('02-esdv');
  await key(page, 'e');
  await clickDrawing(page, 150, 300);
  await atStep('esdvSegments');
  await page.getByLabel('Tag').fill('ESDV-101');
  await page.getByRole('combobox', { name: 'Downstream segment', exact: true }).click();
  await page.getByRole('option', { name: 'IS-01', exact: true }).click();
  await atStep('moreEsdvs');
  for (const [x, y, tag] of [
    [920, 150, 'ESDV-102'],
    [950, 560, 'ESDV-103'],
  ] as const) {
    await key(page, 'e');
    await clickDrawing(page, x, y);
    await page.getByLabel('Tag').fill(tag);
    await page.getByRole('combobox', { name: 'Upstream segment', exact: true }).click();
    await page.getByRole('option', { name: 'IS-01', exact: true }).click();
  }

  await atStep('endFlange');
  await key(page, 'f');
  await clickDrawing(page, 620, 478);
  await atStep('links');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Suggest drawing links…' }).click();
  const suggestions = page.getByTestId('link-suggestions');
  await suggestions.getByRole('button', { name: /^Add \d+ links?$/ }).click();
  await expect(suggestions).toBeHidden();

  await atStep('autoTrace');
  await dismissToasts(page);
  await key(page, 't');
  await atStep('dashed');
  await key(page, 'd');
  await dragDrawing(page, [460, 225], [780, 375]);

  await atStep('followLink');
  await key(page, 'v');
  await clickDrawing(page, 1100, 150);
  await expect(page.getByRole('tab', { name: /PEFS-S-002/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: /^Back to/ }).click();
  await atStep('startCount');
  await shot('03-segments-done');

  await page
    .getByTestId('stage-switcher')
    .getByRole('radio', { name: /Parts count/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Start the parts count?' })
    .getByRole('button', { name: /^Start counting/ })
    .click();

  await atStep('equipmentBar');
  await chooseEquipment(page, 'Valve (manual)');
  await atStep('circleValve');
  await clickDrawing(page, 280, 300);
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');

  await atStep('stamp');
  await chooseEquipment(page, 'Flange');
  await clickDrawing(page, 220, 300);
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');
  await key(page, 's');
  await clickDrawing(page, 340, 300);

  // Find similar: accept the valves of IS-01, reject the rest.
  await atStep('findSimilar');
  await key(page, 'v');
  await clickDrawing(page, 280, 300);
  await page
    .getByTestId('marker-inspector')
    .getByRole('button', { name: 'Find similar symbols' })
    .click();
  const bar = page.getByTestId('suggestion-bar');
  await expect(bar.getByTestId('suggestion-status')).toHaveText(/^1 of \d+$/, { timeout: 30_000 });
  await shot('04-find-similar');
  const valves: [number, number][] = [
    [790, 150],
    [640, 560],
    [620, 420],
  ];
  while ((await page.getByTestId('suggestion').count()) > 0) {
    const current = await page
      .locator('[data-testid="suggestion"][data-current="true"]')
      .evaluate((el) => ({ x: Number(el.dataset.cx), y: Number(el.dataset.cy) }));
    const accept = valves.some(([x, y]) => near(current, x, y));
    await bar.getByRole('button', { name: accept ? 'Accept' : 'Reject', exact: true }).click();
  }
  await bar.getByRole('button', { name: 'Close suggestions' }).click();

  await atStep('sizes');
  await key(page, '0');
  await clickDrawing(page, 790, 150);
  await expect(page.getByTestId('item-editor').getByLabel('Size', { exact: true })).toHaveValue(
    '8"',
  );
  const size = page.getByTestId('item-editor').getByLabel('Size', { exact: true });
  await size.fill('6');
  await size.press('Enter');

  await atStep('countTable');
  // A count in the table highlights its markers.
  await page.getByTestId('count-table').locator('button[aria-pressed]').first().click();
  await atStep('finishCount');
  await shot('05-count');
  await next();

  await atStep('note');
  const notes = page.getByTestId('notes-panel');
  await notes.getByLabel('Add note').fill('V-100 counted as one pressure vessel');
  await notes.getByRole('button', { name: 'Add note' }).click();

  await atStep('status');
  await page.getByTestId('segment-count-panel').getByLabel('Status').click();
  await page.getByRole('option', { name: 'Counted', exact: true }).click();

  await atStep('export');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await exportDialog.getByRole('button', { name: /^Export( anyway)?$/ }).click();
  await expect(exportDialog.getByRole('button', { name: /Download exports/ })).toBeVisible({
    timeout: 60_000,
  });
  await atStep('finish');
  await page.keyboard.press('Escape');
  await shot('06-finish');
  await card.getByRole('button', { name: 'Finish' }).click();
  await expect(card).toBeHidden();

  // Back at the start screen, the practice project is gone with the tour.
  await page.getByRole('button', { name: 'App menu' }).click();
  await page.getByRole('menuitem', { name: 'Back to start screen' }).click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
});

test('the tour can be left and resumed from the app menu', async ({ app }) => {
  await app.open();
  const page = app.page;
  await page.getByRole('button', { name: /Take the guided tour/ }).click();
  const card = page.getByTestId('tour-card');
  await expect(card).toHaveAttribute('data-step', 'welcome');
  await card.getByRole('button', { name: /Start the tour/ }).click();
  await expect(card).toHaveAttribute('data-step', 'openDrawing');

  // Learn more opens the documentation at the step's article; the card steps aside.
  await card.getByRole('button', { name: /Learn more/ }).click();
  const docs = page.getByRole('dialog', { name: 'Documentation' });
  await expect(docs.getByTestId('help-article')).toHaveAttribute('data-article', 'drawings');
  await expect(card).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'End the tour' }).click();
  await expect(card).toBeHidden();
  await page.getByRole('button', { name: 'App menu' }).click();
  await page.getByRole('menuitem', { name: 'Resume the guided tour' }).click();
  await expect(card).toHaveAttribute('data-step', 'openDrawing');
});
