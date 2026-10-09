import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { projectToDoc } from '@/domain/model';
import { runShortcut } from '@/features/markup/shortcuts';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { makePopulatedProject } from '@/test/fixtures';
import { currentStage, setStageCommand } from './stage';

vi.mock('sonner', () => ({ toast: vi.fn() }));

describe('setStageCommand', () => {
  beforeEach(() => {
    useProjectStore.getState().load(projectToDoc(makePopulatedProject()));
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useProjectStore.getState().close();
    vi.mocked(toast).mockClear();
  });

  it('starts the count as one undo step, with the circle tool', () => {
    expect(currentStage()).toBe('segments');
    expect(setStageCommand('count')).toBe(true);
    expect(useProjectStore.getState().doc!.stage).toBe('count');
    expect(useUiStore.getState().tool).toBe('circle');
    expect(setStageCommand('count')).toBe(false);

    useProjectStore.getState().undo();
    expect(currentStage()).toBe('segments');
  });

  it('only views a stage in a read-only project', () => {
    useProjectStore.getState().setReadOnly(true);
    expect(setStageCommand('count')).toBe(true);
    expect(currentStage()).toBe('count');
    expect(useProjectStore.getState().doc!.stage).toBe('segments');
    expect(useUiStore.getState().tool).toBe('select');
  });

  it('points a tool key of the other stage to that stage instead of switching', () => {
    expect(runShortcut({ kind: 'tool', tool: 'circle' })).toBe(true);
    expect(useUiStore.getState().tool).toBe('select');
    expect(toast).toHaveBeenCalledWith(
      'Equipment marker is used in the parts count.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Go to Parts count' }) }),
    );
    // The action asks before counting starts.
    const options = vi.mocked(toast).mock.calls[0]![1] as {
      action: { onClick: (event: unknown) => void };
    };
    options.action.onClick({});
    expect(useUiStore.getState().dialog).toBe('startCount');

    setStageCommand('count');
    expect(runShortcut({ kind: 'tool', tool: 'highlighter' })).toBe(true);
    expect(useUiStore.getState().tool).toBe('circle');
    expect(runShortcut({ kind: 'autoTrace' })).toBe(true);
    expect(toast).toHaveBeenLastCalledWith(
      'Auto trace is used to define segments.',
      expect.anything(),
    );
    expect(runShortcut({ kind: 'tool', tool: 'stamp' })).toBe(true);
    expect(useUiStore.getState().tool).toBe('stamp');
  });
});
