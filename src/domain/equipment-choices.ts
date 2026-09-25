/**
 * The choices in the equipment bar: what new equipment circles are counted as.
 * One per library type, and one per actuation for types that carry one
 * (CNT-03), so "automated valve" is a single click. Pipe is left out: it is
 * logged on dashed line runs (CNT-12).
 */
import type { Actuation, EquipmentType } from './schema/types';

export interface EquipmentChoice {
  /** `typeId`, or `typeId:actuation` for types with actuation. */
  key: string;
  type: EquipmentType;
  actuation: Actuation | null;
}

/** "Any type": the item is placed without a type, and the type is chosen afterwards. */
export const ANY_EQUIPMENT = 'any';

export function equipmentChoices(types: readonly EquipmentType[]): EquipmentChoice[] {
  return types
    .filter((type) => type.category !== 'pipe')
    .flatMap((type): EquipmentChoice[] =>
      type.hasActuation
        ? (['manual', 'automated'] as const).map((actuation) => ({
            key: `${type.id}:${actuation}`,
            type,
            actuation,
          }))
        : [{ key: type.id, type, actuation: null }],
    );
}

/**
 * The choice matching the next item's defaults: `ANY_EQUIPMENT` without a
 * type, '' when the type is not offered or its actuation is not set yet.
 */
export function currentChoice(
  choices: readonly EquipmentChoice[],
  typeId: string | null,
  actuation: Actuation | null,
): string {
  if (!typeId) return ANY_EQUIPMENT;
  const match = choices.find(
    (c) => c.type.id === typeId && (c.actuation === null || c.actuation === actuation),
  );
  return match?.key ?? '';
}
