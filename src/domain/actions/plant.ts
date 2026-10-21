import type { ProjectDoc } from '../model';
import type { PlantUnit } from '../schema/types';

/** Adds a unit to the plant breakdown (DRW-11). */
export function addPlantUnit(doc: ProjectDoc, unit: PlantUnit): void {
  if (doc.plantUnits.some((u) => u.id === unit.id)) return;
  doc.plantUnits.push(unit);
}

/** Renames a plant unit. */
export function renamePlantUnit(doc: ProjectDoc, unitId: string, name: string): void {
  const unit = doc.plantUnits.find((u) => u.id === unitId);
  if (unit && unit.name !== name) unit.name = name;
}

/** Removes a plant unit; its drawings stay in the project, unassigned. */
export function removePlantUnit(doc: ProjectDoc, unitId: string): void {
  const index = doc.plantUnits.findIndex((u) => u.id === unitId);
  if (index < 0) return;
  doc.plantUnits.splice(index, 1);
  for (const drawing of Object.values(doc.drawings)) {
    if (drawing.unitId === unitId) drawing.unitId = null;
  }
}

/**
 * Files drawings under a plant unit, or takes them out of their unit with
 * null. A unit that does not exist changes nothing.
 */
export function assignDrawingsToUnit(
  doc: ProjectDoc,
  drawingIds: readonly string[],
  unitId: string | null,
): void {
  if (unitId !== null && !doc.plantUnits.some((u) => u.id === unitId)) return;
  for (const id of drawingIds) {
    const drawing = doc.drawings[id];
    if (drawing && drawing.unitId !== unitId) drawing.unitId = unitId;
  }
}
