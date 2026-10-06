/**
 * The built-in documentation: opened with F1 or the help button, searchable
 * across every article, and available offline.
 */
import { expect, test } from './fixtures';

test('searches the whole documentation and opens a result at its section', async ({ app }) => {
  await app.open();
  const page = app.page;
  await page.screenshot({ path: test.info().outputPath('start-screen.png') });
  await page.getByRole('button', { name: 'Documentation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Documentation' });
  const article = dialog.getByTestId('help-article');
  await expect(article).toHaveAttribute('data-article', 'getting-started');
  await expect(dialog.getByTestId('help-toc').getByRole('button')).not.toHaveCount(0);

  const search = dialog.getByTestId('help-search');
  await expect(search).toBeFocused();
  await search.fill('end flange closed drain');
  const results = dialog.getByTestId('help-result');
  await expect(results.first()).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveText(/\d+ results?/);
  await page.screenshot({ path: test.info().outputPath('docs-search.png') });

  await results.filter({ hasText: 'Mark end flanges' }).click();
  await expect(article).toHaveAttribute('data-article', 'segments');
  await expect(article.getByRole('heading', { name: 'Mark end flanges' })).toBeInViewport();
  await expect(article.getByTestId('help-mark').first()).toBeVisible();

  // A typo still finds the right place.
  await search.fill('hilighter');
  await expect(results.first()).toContainText(/Highlighter/);

  // Esc clears the search, then closes the documentation.
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(dialog.getByTestId('help-toc')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // F1 reopens it where it was left.
  await page.keyboard.press('F1');
  await expect(dialog.getByTestId('help-article')).toHaveAttribute('data-article', 'segments');
  // Links between articles stay in the documentation.
  await dialog
    .getByTestId('help-article')
    .getByRole('link', { name: 'Counting parts' })
    .first()
    .click();
  await expect(dialog.getByTestId('help-article')).toHaveAttribute('data-article', 'counting');
  await page.screenshot({ path: test.info().outputPath('docs-article.png') });
});
