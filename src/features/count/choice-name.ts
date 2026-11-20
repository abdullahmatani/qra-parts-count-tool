import type { TFunction } from 'i18next';
import type { EquipmentChoice } from '@/domain/equipment-choices';

/** An equipment choice's name: the type's name, with its actuation for valves. */
export function choiceName(choice: EquipmentChoice, t: TFunction): string {
  return choice.actuation
    ? t('equipmentBar.withActuation', {
        type: choice.type.name,
        actuation: t(`equipmentBar.actuation.${choice.actuation}`),
      })
    : choice.type.name;
}
