import { describe, expect, it } from 'vitest';
import { starterLibrary } from './count/starter-library';
import { ANY_EQUIPMENT, currentChoice, equipmentChoices } from './equipment-choices';

describe('equipment bar choices', () => {
  const types = starterLibrary().equipmentTypes;
  const valve = types.find((t) => t.category === 'valve')!;
  const flange = types.find((t) => t.category === 'flange')!;
  const choices = equipmentChoices(types);

  it('offers valves once per actuation and leaves pipe to line runs (CNT-03, CNT-12)', () => {
    const valves = choices.filter((c) => c.type.id === valve.id);
    expect(valves.map((c) => c.actuation)).toEqual(['manual', 'automated']);
    expect(choices.find((c) => c.type.id === flange.id)?.actuation).toBeNull();
    expect(choices.some((c) => c.type.category === 'pipe')).toBe(false);
    expect(new Set(choices.map((c) => c.key)).size).toBe(choices.length);
  });

  it('shows which choice the next item will get', () => {
    expect(currentChoice(choices, null, 'automated')).toBe(ANY_EQUIPMENT);
    expect(currentChoice(choices, valve.id, 'automated')).toBe(`${valve.id}:automated`);
    expect(currentChoice(choices, flange.id, 'automated')).toBe(flange.id);
    // A valve without an actuation yet matches neither valve choice.
    expect(currentChoice(choices, valve.id, null)).toBe('');
  });
});
