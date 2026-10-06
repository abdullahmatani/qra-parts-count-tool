import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { useHelpStore } from '@/features/help/help-store';
import { closeProject } from '@/features/project/project-actions';
import { useTourStore } from '@/features/tour/tour-store';
import { usePreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makePopulatedProject } from '@/test/fixtures';
import { App } from './App';

describe('App shell', () => {
  afterEach(() => {
    act(() => {
      useProjectStore.getState().close();
      useUiStore.getState().reset();
    });
  });

  it('shows the start screen when no project is open', () => {
    render(<App />);
    expect(screen.getByTestId('start-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'QRA Parts Count Tool' })).toBeInTheDocument();
    // jsdom has no File System Access API, so the unsupported-browser notice shows.
    expect(screen.getByRole('alert')).toHaveTextContent(/Edge or Google Chrome/);
  });

  it('shows the three-pane workspace with header and status bar for an open project', () => {
    const project = makePopulatedProject();
    act(() => useProjectStore.getState().load(projectToDoc(project)));
    render(<App />);

    expect(screen.getByTestId('project-name')).toHaveTextContent('Test project');
    expect(screen.getByTestId('left-pane')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-area')).toBeInTheDocument();
    expect(screen.getByTestId('right-pane')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Markup tools' })).toBeInTheDocument();
    expect(
      within(screen.getByTestId('drawing-list')).getByText('PEFS-001 / 1'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('segment-list')).getByText('IS-01')).toBeInTheDocument();
  });

  it('tints the toolbar with the active segment (SEG-06)', async () => {
    const project = makePopulatedProject();
    act(() => useProjectStore.getState().load(projectToDoc(project)));
    render(<App />);
    const user = userEvent.setup();

    expect(screen.getByTestId('active-segment-chip')).toHaveTextContent(/unassigned/);
    await user.click(within(screen.getByTestId('segment-list')).getByText('IS-01'));
    expect(screen.getByTestId('toolbar')).toHaveAttribute(
      'data-active-segment',
      project.segments[0]!.id,
    );
    expect(screen.getByTestId('active-segment-chip')).toHaveTextContent('New markers go to IS-01');
  });

  it('opens a drawing tab from the drawing list', async () => {
    act(() => useProjectStore.getState().load(projectToDoc(makePopulatedProject())));
    render(<App />);
    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('drawing-list')).getByText('PEFS-001 / 1'));
    expect(screen.getByRole('tab', { name: 'PEFS-001 / 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the settings dialog and changes the theme', async () => {
    act(() => useProjectStore.getState().load(projectToDoc(makePopulatedProject())));
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    await user.click(within(dialog).getByRole('radio', { name: 'Dark' }));
    expect(usePreferences.getState().theme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    act(() => usePreferences.getState().setTheme('system'));
  });

  it('enables undo after an edit and reverts it', async () => {
    act(() => useProjectStore.getState().load(projectToDoc(makePopulatedProject())));
    render(<App />);
    const user = userEvent.setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();
    act(() => {
      useProjectStore.getState().apply('Rename', (d) => void (d.name = 'Renamed'));
    });
    expect(screen.getByTestId('project-name')).toHaveTextContent('Renamed');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByTestId('project-name')).toHaveTextContent('Test project');
  });

  it('opens the documentation with F1 on the start screen', async () => {
    render(<App />);
    await userEvent.setup().keyboard('{F1}');
    const dialog = await screen.findByRole('dialog', { name: 'Documentation' });
    expect(await within(dialog).findByTestId('help-search')).toBeInTheDocument();
    act(() => useHelpStore.getState().close());
  });

  it('starts the guided tour on a practice project from the start screen', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Take the guided tour/ }));
    const card = await screen.findByTestId('tour-card', {}, { timeout: 10_000 });
    expect(card).toHaveAttribute('data-step', 'welcome');
    expect(screen.getByTestId('practice-badge')).toHaveTextContent('Practice project');
    expect(screen.getByTestId('project-name')).toHaveTextContent('Guided tour');
    expect(
      within(screen.getByTestId('drawing-list')).getByText('PEFS-S-001 / 1'),
    ).toBeInTheDocument();
    expect(useWorkspaceStore.getState().inMemory).toBe(true);

    // The app menu on the logo offers the tour again, and the documentation.
    // Radix menus open from the keyboard in jsdom (pointer events lack a button there).
    act(() => screen.getByRole('button', { name: 'App menu' }).focus());
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('menuitem', { name: 'Restart the guided tour' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Documentation/ }));
    expect(await screen.findByRole('dialog', { name: 'Documentation' })).toBeInTheDocument();
    act(() => useHelpStore.getState().close());

    await act(() => closeProject());
    expect(useTourStore.getState().projectId).toBeNull();
  });
});
