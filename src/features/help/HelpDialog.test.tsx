import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { searchHelp } from '@/domain/help/search';
import { HELP_INDEX } from './articles';
import { HelpDialog } from './HelpDialog';
import { openHelp, useHelpStore } from './help-store';

describe('documentation viewer', () => {
  afterEach(() => {
    act(() => {
      useHelpStore.getState().close();
      useHelpStore.getState().setQuery('');
      useHelpStore.getState().navigate({ articleId: 'getting-started' });
    });
  });

  it('opens at the contents and reads an article', async () => {
    render(<HelpDialog />);
    act(() => openHelp());
    const dialog = await screen.findByRole('dialog', { name: 'Documentation' });
    const toc = await within(dialog).findByTestId('help-toc');
    expect(within(dialog).getByTestId('help-article')).toHaveAttribute(
      'data-article',
      'getting-started',
    );
    await userEvent.setup().click(within(toc).getByRole('button', { name: 'Counting parts' }));
    expect(within(dialog).getByTestId('help-article')).toHaveAttribute('data-article', 'counting');
    expect(
      within(dialog).getByRole('heading', { level: 1, name: 'Counting parts' }),
    ).toBeInTheDocument();
  });

  it('searches every article and opens a result at its section', async () => {
    render(<HelpDialog />);
    act(() => openHelp());
    const dialog = await screen.findByRole('dialog', { name: 'Documentation' });
    const user = userEvent.setup();
    const search = await within(dialog).findByTestId('help-search');
    expect(search).toHaveFocus();
    await user.type(search, 'auto trace');
    const results = await within(dialog).findAllByTestId('help-result');
    expect(results[0]).toHaveTextContent('Auto trace');
    expect(within(dialog).getByRole('status')).toHaveTextContent(/\d+ results?/);
    await user.click(results[0]!);
    expect(useHelpStore.getState()).toMatchObject({
      articleId: 'highlighting',
      sectionId: 'auto-trace',
    });
    // The matches are marked in the article.
    expect(within(dialog).getAllByTestId('help-mark').length).toBeGreaterThan(0);

    // Enter opens the result chosen with the arrow keys.
    const second = searchHelp(HELP_INDEX, 'drawing register').hits[1]!.section;
    await user.clear(search);
    await user.type(search, 'drawing register{ArrowDown}{Enter}');
    expect(useHelpStore.getState()).toMatchObject({
      articleId: second.articleId,
      sectionId: second.sectionId,
    });
  });

  it('says when nothing is found, and Esc clears the search first', async () => {
    render(<HelpDialog />);
    act(() => openHelp());
    const dialog = await screen.findByRole('dialog', { name: 'Documentation' });
    const search = await within(dialog).findByTestId('help-search');
    const user = userEvent.setup();
    await user.type(search, 'xyzzyq');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Nothing found for “xyzzyq”.');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(useHelpStore.getState().query).toBe('');
    expect(screen.getByRole('dialog', { name: 'Documentation' })).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(useHelpStore.getState().open).toBe(false);
  });

  it('follows links between articles', async () => {
    render(<HelpDialog />);
    act(() => openHelp({ articleId: 'getting-started' }));
    const dialog = await screen.findByRole('dialog', { name: 'Documentation' });
    const article = await within(dialog).findByTestId('help-article');
    await userEvent
      .setup()
      .click(within(article).getAllByRole('link', { name: 'Segments and ESDVs' })[0]!);
    expect(useHelpStore.getState().articleId).toBe('segments');
  });

  it('opens with F1-style targets at a section', async () => {
    render(<HelpDialog />);
    act(() => openHelp({ articleId: 'segments', sectionId: 'mark-esdvs' }));
    const dialog = await screen.findByRole('dialog', { name: 'Documentation' });
    expect(await within(dialog).findByTestId('help-article')).toHaveAttribute(
      'data-article',
      'segments',
    );
    expect(within(dialog).getByRole('heading', { name: 'Mark ESDVs' })).toBeInTheDocument();
  });
});
