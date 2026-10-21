/**
 * The plant breakdown of the drawings (DRW-11): the plant (the project's
 * facility), its units, and the drawings filed under each unit, as the
 * drawing list shows them when organised.
 */
import { drawingDisplayName, drawingMatches } from './drawings';
import type { Drawing, PlantUnit } from './schema/types';

/** The plant's name: the project's facility, or the project name when it has none. */
export function plantName(project: { facility: string; name: string }): string {
  return project.facility.trim() || project.name;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Orders names as people expect: "Unit 2" before "Unit 10", ignoring case. */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Plant units in name order. */
export function sortedUnits(units: readonly PlantUnit[]): PlantUnit[] {
  return [...units].sort((a, b) => compareNames(a.name, b.name));
}

/** The unit already called `name` (ignoring case and surrounding spaces), other than `exceptId`. */
export function unitNamed(
  units: readonly PlantUnit[],
  name: string,
  exceptId?: string,
): PlantUnit | undefined {
  const key = name.trim().toLowerCase();
  return units.find((u) => u.id !== exceptId && u.name.trim().toLowerCase() === key);
}

export interface PlantTreeUnit {
  unit: PlantUnit;
  drawings: Drawing[];
}

export interface PlantTree {
  units: PlantTreeUnit[];
  /** Drawings not filed under a unit, or filed under one that no longer exists. */
  unassigned: Drawing[];
}

/**
 * Groups drawings by plant unit, with units and drawings in name order
 * (drawing number, then sheet). With a filter, a unit whose name matches
 * keeps all its drawings, other units keep the drawings that match, and a
 * unit left with no drawings is dropped.
 */
export function buildPlantTree(
  drawings: readonly Drawing[],
  units: readonly PlantUnit[],
  query = '',
): PlantTree {
  const filtering = query.trim() !== '';
  const q = query.trim().toLowerCase();
  const byUnit = new Map<string, Drawing[]>(units.map((u) => [u.id, []]));
  const unassigned: Drawing[] = [];
  for (const drawing of drawings) {
    const list = (drawing.unitId && byUnit.get(drawing.unitId)) || unassigned;
    list.push(drawing);
  }
  const byName = (a: Drawing, b: Drawing) =>
    compareNames(drawingDisplayName(a), drawingDisplayName(b));

  const tree: PlantTree = { units: [], unassigned: [] };
  for (const unit of sortedUnits(units)) {
    const all = byUnit.get(unit.id)!;
    const shown =
      filtering && !unit.name.toLowerCase().includes(q)
        ? all.filter((d) => drawingMatches(d, query))
        : all;
    if (filtering && shown.length === 0) continue;
    tree.units.push({ unit, drawings: shown.sort(byName) });
  }
  tree.unassigned = unassigned.filter((d) => drawingMatches(d, query)).sort(byName);
  return tree;
}
