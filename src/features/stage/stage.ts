/**
 * The study's stage (segments, then count) as the interface uses it. A
 * read-only project cannot record its stage, so it is only viewed there.
 */
import { useEffect, useMemo } from 'react';
import {
  isEditableInStage,
  stageStartTool,
  stageTools,
  stageWarnings,
  type StageTool,
  type StageWarnings,
} from '@/domain/stage';
import { useMarkerWarnings } from '@/features/count/useCount';
import type { ProjectStage } from '@/domain/schema/types';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const t = i18n.t.bind(i18n);

/** The stage shown: the project's, or the one viewed in a read-only project. */
export function currentStage(): ProjectStage {
  const { doc, readOnly } = useProjectStore.getState();
  const view = useUiStore.getState().stageView;
  return (readOnly ? view : null) ?? doc?.stage ?? 'segments';
}

export function useStage(): ProjectStage {
  const stage = useProjectStore((s) => s.doc?.stage ?? 'segments');
  const readOnly = useProjectStore((s) => s.readOnly);
  const view = useUiStore((s) => s.stageView);
  return (readOnly ? view : null) ?? stage;
}

function pipeLengthCounting(): boolean {
  return useProjectStore.getState().doc?.settings.pipeLengthCounting ?? false;
}

/** The tools of the stage shown. */
export function currentStageTools(): StageTool[] {
  return stageTools(currentStage(), pipeLengthCounting());
}

export function useStageTools(): StageTool[] {
  const stage = useStage();
  const pipe = useProjectStore((s) => s.doc?.settings.pipeLengthCounting ?? false);
  return useMemo(() => stageTools(stage, pipe), [stage, pipe]);
}

const NO_WARNINGS: StageWarnings = {
  markerIds: [],
  counts: { unassigned: 0, incomplete: 0, duplicate: 0 },
};

/** The marker warnings that matter in the stage shown. */
export function useStageWarnings(): StageWarnings {
  const warnings = useMarkerWarnings();
  const stage = useStage();
  const doc = useProjectStore((s) => s.doc);
  return useMemo(
    () => (doc ? stageWarnings(doc, warnings, stage) : NO_WARNINGS),
    [doc, warnings, stage],
  );
}

/**
 * Moves the study to a stage, as one undo step, and picks up the stage's
 * main tool. In a read-only project the stage is only viewed.
 */
export function setStageCommand(stage: ProjectStage): boolean {
  if (currentStage() === stage) return false;
  const project = useProjectStore.getState();
  if (!project.doc) return false;
  const ui = useUiStore.getState();
  if (project.readOnly) {
    ui.setStageView(stage);
  } else if (
    !project.apply(t(`stage.history.${stage}`), (draft) => {
      draft.stage = stage;
    })
  ) {
    return false;
  }
  ui.setTool(project.readOnly ? 'select' : stageStartTool(stage));
  return true;
}

/**
 * Keeps the tool and the selection to what the stage allows, also when an
 * undo or redo changes the stage: segment set-up is locked while counting.
 */
export function useStageGuard(): void {
  const stage = useStage();
  const pipe = useProjectStore((s) => s.doc?.settings.pipeLengthCounting ?? false);
  useEffect(() => {
    const ui = useUiStore.getState();
    if (!stageTools(stage, pipe).includes(ui.tool)) ui.setTool('select');
    const markers = useProjectStore.getState().doc?.markers ?? {};
    const keep = ui.selection.filter((id) => {
      const marker = markers[id];
      return marker !== undefined && isEditableInStage(marker, stage, pipe);
    });
    if (keep.length !== ui.selection.length) ui.setSelection(keep);
    if (stage === 'count' && ui.selectedLinkId) ui.setSelectedLink(null);
  }, [stage, pipe]);
}
