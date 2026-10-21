import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDrawings } from '@/domain/actions/drawings';
import { projectToDoc } from '@/domain/model';
import { usePreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { makeDrawing, makePopulatedProject } from '@/test/fixtures';
import { DrawingList } from './DrawingList';

const store = () => useProjectStore.getState();

/** A drag carrying a drawing, as the drawing list starts it. */
function drawingDrag(drawingId: string) {
  const data = new Map([['application/x-qrapc-drawing', drawingId]]);
  return {
    dataTransfer: {
      types: [...data.keys()],
      getData: (type: string) => data.get(type) ?? '',
      dropEffect: 'none',
    },
  };
}

describe('drawing list organised by plant unit (DRW-11)', () => {
  let first: string;
  let second: string;

  beforeEach(() => {
    const doc = projectToDoc(makePopulatedProject());
    addDrawings(doc, [makeDrawing({ drawingNo: 'PEFS-002', sheet: '', fileName: 'PEFS-002.pdf' })]);
    act(() => {
      store().load(doc);
      usePreferences.setState({ drawingListView: 'all' });
    });
    [first, second] = store().doc!.drawingOrder as [string, string];
  });
  afterEach(() => {
    act(() => {
      store().close();
      useUiStore.getState().reset();
      usePreferences.setState({ drawingListView: 'all' });
    });
  });

  it('switches between all files and the plant breakdown, and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<DrawingList />);
    expect(screen.getByTestId('drawing-list')).toBeInTheDocument();
    expect(screen.queryByTestId('drawing-tree')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Organised by plant unit' }));
    expect(usePreferences.getState().drawingListView).toBe('organised');
    const tree = screen.getByTestId('drawing-tree');
    // Plant (the facility), then Unassigned with every drawing while there are no units.
    expect(within(tree).getByRole('button', { name: 'Plant A' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const unassigned = tree.querySelector('[data-unassigned]') as HTMLElement;
    expect(within(unassigned).getByRole('button', { name: /^Unassigned/ })).toBeInTheDocument();
    expect(unassigned.querySelectorAll('li[data-drawing-id]')).toHaveLength(2);
    expect(tree).toHaveTextContent('Add units to file the drawings under');

    await user.click(screen.getByRole('radio', { name: 'All files' }));
    expect(screen.getByTestId('drawing-list').querySelectorAll('li[data-drawing-id]')).toHaveLength(
      2,
    );
  });

  it('adds a unit from the plant and files drawings dropped on it', async () => {
    const user = userEvent.setup();
    act(() => usePreferences.setState({ drawingListView: 'organised' }));
    render(<DrawingList />);
    const tree = screen.getByTestId('drawing-tree');

    await user.click(within(tree).getByRole('button', { name: 'Add unit' }));
    const field = screen.getByTestId('unit-name');
    expect(field).toHaveFocus();
    await user.type(field, 'Unit 100{Enter}');
    const unitId = store().doc!.plantUnits[0]!.id;
    const unit = tree.querySelector(`[data-unit-id="${unitId}"]`) as HTMLElement;
    expect(within(unit).getByRole('button', { name: /^Unit 100/ })).toBeInTheDocument();
    expect(unit).toHaveTextContent('No drawings yet');

    const row = tree.querySelector(`li[data-drawing-id="${second}"]`)!;
    expect(row).toHaveAttribute('draggable', 'true');
    fireEvent.dragOver(unit.firstElementChild!, drawingDrag(second));
    fireEvent.drop(unit.firstElementChild!, drawingDrag(second));
    expect(store().doc!.drawings[second]!.unitId).toBe(unitId);
    expect(unit.querySelectorAll('li[data-drawing-id]')).toHaveLength(1);

    // Dropped on the plant, it leaves its unit.
    const plantRow = within(tree).getByRole('button', { name: 'Plant A' }).parentElement!;
    fireEvent.drop(plantRow, drawingDrag(second));
    expect(store().doc!.drawings[second]!.unitId).toBeNull();
  });

  it('opens and closes units, and filters by drawing or unit name', async () => {
    const user = userEvent.setup();
    act(() => {
      store().apply('units', (doc) => {
        doc.plantUnits.push({ id: 'unt_10', name: 'Unit 10' }, { id: 'unt_9', name: 'Unit 9' });
        doc.drawings[first]!.unitId = 'unt_10';
        doc.drawings[second]!.unitId = 'unt_9';
      });
      usePreferences.setState({ drawingListView: 'organised' });
    });
    render(<DrawingList />);
    const tree = screen.getByTestId('drawing-tree');
    // Units in name order, numbers as numbers.
    expect(
      [...tree.querySelectorAll<HTMLElement>('[data-unit-id]')].map((u) => u.dataset.unitId),
    ).toEqual(['unt_9', 'unt_10']);

    const unit10 = within(tree).getByRole('button', { name: /^Unit 10/ });
    await user.click(unit10);
    expect(unit10).toHaveAttribute('aria-expanded', 'false');
    expect(tree.querySelector(`li[data-drawing-id="${first}"]`)).toBeNull();

    // Filtering shows matches even in closed units, and only the units that have them.
    const search = screen.getByRole('textbox', { name: 'Search drawings' });
    await user.type(search, 'PEFS-001');
    expect(
      [...tree.querySelectorAll<HTMLElement>('[data-unit-id]')].map((u) => u.dataset.unitId),
    ).toEqual(['unt_10']);
    expect(tree.querySelector(`li[data-drawing-id="${first}"]`)).not.toBeNull();

    await user.clear(search);
    await user.type(search, 'unit 9');
    expect(tree.querySelectorAll('li[data-drawing-id]')).toHaveLength(1);
    expect(tree.querySelector(`li[data-drawing-id="${second}"]`)).not.toBeNull();

    await user.clear(search);
    await user.type(search, 'nothing like it');
    expect(tree).toHaveTextContent('No drawings match.');
  });

  it('shows the breakdown without editing controls on a read-only project', () => {
    act(() => {
      store().setReadOnly(true);
      usePreferences.setState({ drawingListView: 'organised' });
    });
    render(<DrawingList />);
    const tree = screen.getByTestId('drawing-tree');
    expect(within(tree).queryByRole('button', { name: 'Add unit' })).toBeNull();
    expect(tree.querySelector('li[data-drawing-id]')).not.toHaveAttribute('draggable', 'true');
  });
});
