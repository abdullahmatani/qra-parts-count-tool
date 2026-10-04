import { describe, expect, it } from 'vitest';
import { starterLibrary } from './count/starter-library';
import { ANY_EQUIPMENT, currentChoice, equipmentChoices, fitChoices } from './equipment-choices';

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

describe('fitChoices', () => {
  const widths = [100, 120, 80, 150, 90];
  const fit = (available: number, chosen = -1) =>
    fitChoices(widths, available, { gap: 2, more: 60, chosen });

  it('shows every choice when they all fit', () => {
    expect(fit(550)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps the first ones that fit beside the More button, in order', () => {
    // More (60 + 2), then 100 + 2, 120 + 2 and 80 + 2 = 368; the next (150) does not fit.
    expect(fit(368)).toEqual([0, 1, 2]);
    expect(fit(367)).toEqual([0, 1]);
    expect(fit(50)).toEqual([]);
  });

  it('always shows the chosen one, in its place', () => {
    // The 150 wide choice takes its room first: More, 150, then 100 and 120.
    expect(fit(440, 3)).toEqual([0, 1, 3]);
    expect(fit(50, 4)).toEqual([4]);
  });
});
