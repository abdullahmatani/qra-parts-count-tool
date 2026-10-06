import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { starterLibrary } from '@/domain/count/starter-library';
import { projectToDoc } from '@/domain/model';
import { useHelpStore } from '@/features/help/help-store';
import { buildTourProject } from '@/features/sample/sample-project';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { TourCoach } from './TourCoach';
import { useTourStore } from './tour-store';
import { TOUR_STEPS, sheetId } from './tour-steps';

function openPractice() {
  const project = buildTourProject(starterLibrary(), { hash: 'a'.repeat(64) }, new Date());
  act(() => {
    useProjectStore.getState().load(projectToDoc(project));
    useTourStore.getState().start(project.id);
  });
  return useProjectStore.getState().doc!;
}

const card = () => screen.getByTestId('tour-card');
const stepIndex = (id: string) => TOUR_STEPS.findIndex((step) => step.id === id);

describe('guided tour card', () => {
  beforeEach(() => {
    act(() => useUiStore.getState().reset());
  });
  afterEach(() => {
    act(() => {
      useTourStore.getState().reset();
      useProjectStore.getState().close();
      useUiStore.getState().reset();
      useHelpStore.getState().close();
    });
  });

  it('welcomes, then waits for each step and ticks it off', async () => {
    const doc = openPractice();
    render(<TourCoach />);
    const user = userEvent.setup();
    expect(card()).toHaveAttribute('data-step', 'welcome');
    expect(within(card()).getByText(`Step 1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
    await user.click(within(card()).getByRole('button', { name: /Start the tour/ }));

    expect(card()).toHaveAttribute('data-step', 'openDrawing');
    expect(within(card()).getByTestId('tour-status')).toHaveTextContent('Waiting for you');
    expect(within(card()).getByRole('button', { name: /Skip/ })).toBeInTheDocument();

    act(() => useUiStore.getState().openDrawing(sheetId(doc, 'PEFS-S-001')!));
    expect(within(card()).getByTestId('tour-status')).toHaveTextContent('Done');
    // Done while it showed: the tour moves on by itself.
    await waitFor(() => expect(card()).toHaveAttribute('data-step', 'navigate'), {
      timeout: 3000,
    });

    // Back to a step already done: it waits for Next.
    await user.click(within(card()).getByRole('button', { name: /Back/ }));
    expect(card()).toHaveAttribute('data-step', 'openDrawing');
    expect(card()).toHaveAttribute('data-done', 'true');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(card()).toHaveAttribute('data-step', 'openDrawing');
    await user.click(within(card()).getByRole('button', { name: /Next/ }));
    expect(card()).toHaveAttribute('data-step', 'navigate');
  });

  it('says when a step is in the other stage', () => {
    openPractice();
    act(() => useTourStore.getState().goTo(stepIndex('equipmentBar')));
    render(<TourCoach />);
    expect(within(card()).getByText('This step is in Parts count.')).toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: 'Go to Parts count' })).toBeInTheDocument();
  });

  it('opens the documentation about the step', async () => {
    openPractice();
    act(() => useTourStore.getState().goTo(stepIndex('esdv')));
    render(<TourCoach />);
    await userEvent.setup().click(within(card()).getByRole('button', { name: /Learn more/ }));
    expect(useHelpStore.getState()).toMatchObject({
      open: true,
      articleId: 'segments',
      sectionId: 'mark-esdvs',
    });
    // The card steps aside while the documentation is open.
    expect(screen.queryByTestId('tour-card')).not.toBeInTheDocument();
  });

  it('folds, ends, and goes with its practice project', async () => {
    openPractice();
    render(<TourCoach />);
    const user = userEvent.setup();
    await user.click(within(card()).getByRole('button', { name: 'Fold the tour card' }));
    expect(within(card()).queryByRole('button', { name: /Start the tour/ })).toBeNull();
    await user.click(within(card()).getByRole('button', { name: 'Unfold the tour card' }));
    await user.click(within(card()).getByRole('button', { name: 'End the tour' }));
    expect(screen.queryByTestId('tour-card')).not.toBeInTheDocument();
    expect(useTourStore.getState().active).toBe(false);

    act(() => useTourStore.getState().resume());
    expect(card()).toBeInTheDocument();
    act(() => useProjectStore.getState().close());
    expect(useTourStore.getState()).toMatchObject({ active: false, projectId: null });
  });
});
