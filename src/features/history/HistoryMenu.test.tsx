import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { projectToDoc } from '@/domain/model';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { makePopulatedProject } from '@/test/fixtures';
import { useHistoryPreviewStore } from './history-store';

const store = () => useProjectStore.getState();

/** Radix menus open from the keyboard in jsdom (pointer events lack a button there). */
async function openMenu(name: string) {
  const user = userEvent.setup();
  act(() => screen.getByRole('button', { name }).focus());
  await user.keyboard('{Enter}');
  return { user, menu: await screen.findByRole('menu') };
}

describe('undo and redo history menus (PRJ-09)', () => {
  let segmentId: string;

  beforeEach(() => {
    act(() => {
      store().load(projectToDoc(makePopulatedProject()));
      segmentId = store().doc!.segmentOrder[0]!;
      store().apply('edit project settings', (d) => void (d.client = 'B'));
      store().apply('edit segment IS-01', (d) => void (d.segments[segmentId]!.label = 'IS-02'));
      store().apply('rename project', (d) => void (d.name = 'Renamed'));
    });
  });
  afterEach(() => {
    act(() => {
      store().close();
      useUiStore.getState().reset();
    });
  });

  it('lists the steps to undo, most recent first, with what each changed', async () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Forward history' })).toBeDisabled();
    const { menu } = await openMenu('History');
    const steps = within(menu).getAllByTestId('history-step');
    expect(
      within(menu)
        .getAllByTestId('history-step-label')
        .map((s) => s.textContent),
    ).toEqual(['Rename project', 'Edit segment IS-01', 'Edit project settings']);
    expect(steps[1]).toHaveTextContent('Changes 1 segment');
    expect(steps[2]).toHaveTextContent('Changes project details');
  });

  it('highlights the steps that go together and greys out what they change', async () => {
    render(<App />);
    const { user, menu } = await openMenu('History');
    const steps = () => within(menu).getAllByTestId('history-step');
    // The first step is the one undone next.
    expect(steps().map((s) => s.dataset.inRange)).toEqual(['true', 'false', 'false']);
    expect(useHistoryPreviewStore.getState().preview?.steps).toBe(1);

    await user.keyboard('{ArrowDown}');
    expect(steps().map((s) => s.dataset.inRange)).toEqual(['true', 'true', 'false']);
    expect(within(menu).getByRole('status')).toHaveTextContent('Undo 2 steps');
    // The segment the second step renamed is greyed out in the segment list.
    // (The open menu hides the rest of the page from the accessibility tree.)
    const segment = within(screen.getByTestId('segment-list')).getByText('IS-02').closest('button');
    expect(segment).toHaveAttribute('data-changing', 'true');

    // Choosing it undoes both steps at once; closing the menu ends the preview.
    await user.keyboard('{Enter}');
    expect(store().doc).toMatchObject({ name: 'Test project', client: 'B' });
    expect(store().doc!.segments[segmentId]!.label).toBe('IS-01');
    expect(store().future).toHaveLength(2);
    expect(useHistoryPreviewStore.getState().preview).toBeNull();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('redoes up to the step chosen in the forward history', async () => {
    act(() => void store().undo(3));
    render(<App />);
    const { user, menu } = await openMenu('Forward history');
    expect(within(menu).getAllByTestId('history-step')[0]).toHaveTextContent(
      'Edit project settings',
    );
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(store().doc).toMatchObject({ name: 'Test project', client: 'B' });
    expect(store().doc!.segments[segmentId]!.label).toBe('IS-02');
    expect(store().future.map((e) => e.label)).toEqual(['rename project']);
  });
});
