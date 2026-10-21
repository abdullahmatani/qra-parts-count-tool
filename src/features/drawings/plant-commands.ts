/**
 * Plant breakdown commands for the drawing list and the register (DRW-11):
 * rename the plant (the project's facility), add, rename and delete its
 * units, and file drawings under them. Each is one undo step.
 */
import { toast } from 'sonner';
import { drawingDisplayName } from '@/domain/drawings';
import {
  addPlantUnit,
  assignDrawingsToUnit,
  removePlantUnit,
  renamePlantUnit,
} from '@/domain/actions/plant';
import { unitNamed } from '@/domain/plant';
import i18n from '@/i18n';
import { newId } from '@/lib/ids';
import { useProjectStore } from '@/store/project-store';

const t = i18n.t.bind(i18n);

/** Longest plant unit name the project file takes. */
const UNIT_NAME_MAX = 200;
/** Longest facility name the project file takes. */
const PLANT_NAME_MAX = 500;

/** A unit name, or null (with a message) when it is blank or another unit has it. */
function unitName(name: string, exceptId?: string): string | null {
  const trimmed = name.trim().slice(0, UNIT_NAME_MAX);
  const doc = useProjectStore.getState().doc;
  if (!doc || !trimmed) return null;
  if (unitNamed(doc.plantUnits, trimmed, exceptId)) {
    toast.error(t('plant.nameTaken', { name: trimmed }));
    return null;
  }
  return trimmed;
}

/** Renames the plant: the project's facility, shown at the top of the organised list. */
export function renamePlantCommand(name: string): boolean {
  const facility = name.trim().slice(0, PLANT_NAME_MAX);
  const doc = useProjectStore.getState().doc;
  if (!doc || !facility || facility === doc.facility) return false;
  return useProjectStore
    .getState()
    .apply(t('plant.history.renamePlant', { name: facility }), (draft) => {
      draft.facility = facility;
    });
}

/**
 * Adds a plant unit and files `drawingIds` under it, as one step. Returns the
 * new unit's id, or null when the name is blank or another unit has it.
 */
export function addPlantUnitCommand(
  name: string,
  drawingIds: readonly string[] = [],
): string | null {
  const trimmed = unitName(name);
  if (!trimmed) return null;
  const id = newId('unt');
  const done = useProjectStore
    .getState()
    .apply(t('plant.history.add', { name: trimmed }), (draft) => {
      addPlantUnit(draft, { id, name: trimmed });
      assignDrawingsToUnit(draft, drawingIds, id);
    });
  return done ? id : null;
}

/** Renames a plant unit. A blank, unchanged or taken name changes nothing. */
export function renamePlantUnitCommand(unitId: string, name: string): boolean {
  const unit = useProjectStore.getState().doc?.plantUnits.find((u) => u.id === unitId);
  if (!unit || name.trim() === unit.name) return false;
  const trimmed = unitName(name, unitId);
  if (!trimmed) return false;
  return useProjectStore
    .getState()
    .apply(t('plant.history.rename', { name: trimmed }), (draft) =>
      renamePlantUnit(draft, unitId, trimmed),
    );
}

/** Deletes a plant unit. Its drawings stay in the project, unassigned. */
export function deletePlantUnitCommand(unitId: string): boolean {
  const unit = useProjectStore.getState().doc?.plantUnits.find((u) => u.id === unitId);
  if (!unit) return false;
  return useProjectStore
    .getState()
    .apply(t('plant.history.delete', { name: unit.name }), (draft) =>
      removePlantUnit(draft, unitId),
    );
}

/** Files drawings under a plant unit, or takes them out of their unit with null. */
export function moveDrawingsToUnitCommand(
  drawingIds: readonly string[],
  unitId: string | null,
): boolean {
  const doc = useProjectStore.getState().doc;
  if (!doc) return false;
  const moving = drawingIds.flatMap((id) => {
    const drawing = doc.drawings[id];
    return drawing && drawing.unitId !== unitId ? [drawing] : [];
  });
  const unit = doc.plantUnits.find((u) => u.id === unitId);
  if (moving.length === 0 || (unitId !== null && !unit)) return false;
  const drawings =
    moving.length === 1
      ? drawingDisplayName(moving[0]!)
      : t('plant.drawings', { count: moving.length });
  const label = unit
    ? t('plant.history.move', { drawings, unit: unit.name })
    : t('plant.history.unassign', { drawings });
  return useProjectStore.getState().apply(label, (draft) =>
    assignDrawingsToUnit(
      draft,
      moving.map((d) => d.id),
      unitId,
    ),
  );
}
