import { describe, expect, it } from 'vitest';
import { starterLibrary } from './count/starter-library';
import {
  ANY_EQUIPMENT,
  WHEEL_MAX,
  currentChoice,
  equipmentChoices,
  fitChoices,
  wheelAngle,
  wheelChoices,
  wheelIndex,
} from './equipment-choices';

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

describe('quick-pick wheel', () => {
  const types = starterLibrary().equipmentTypes;

  it('offers the keyed types of the starter library, valves once per actuation', () => {
    const names = wheelChoices(types).map((c) =>
      c.actuation ? `${c.type.name} (${c.actuation})` : c.type.name,
    );
    expect(names).toEqual([
      'Valve (manual)',
      'Valve (automated)',
      'Flange',
      'Small-bore instrument connection',
      'Pressure vessel',
      'Pump, centrifugal (single seal)',
    ]);
  });

  it('falls back to the first choices when no type has a key, and caps the wheel', () => {
    const unkeyed = types.map((t) => ({ ...t, shortcut: null }));
    const choices = wheelChoices(unkeyed);
    expect(choices).toHaveLength(WHEEL_MAX);
    expect(choices.map((c) => c.key)).toEqual(
      equipmentChoices(unkeyed)
        .slice(0, WHEEL_MAX)
        .map((c) => c.key),
    );
    expect(wheelChoices([])).toEqual([]);
  });

  it('picks the wedge the pointer points into, clockwise from the top', () => {
    // Four wedges: up, right, down, left.
    expect(wheelIndex(0, -50, 4, 20)).toBe(0);
    expect(wheelIndex(50, 0, 4, 20)).toBe(1);
    expect(wheelIndex(0, 50, 4, 20)).toBe(2);
    expect(wheelIndex(-50, 0, 4, 20)).toBe(3);
    // Just left of straight up is still the top wedge.
    expect(wheelIndex(-10, -50, 4, 20)).toBe(0);
    // Six wedges, 60° each: down-right is wedge 2 (120°).
    expect(wheelIndex(43, 25, 6, 20)).toBe(2);
  });

  it('picks nothing near the centre', () => {
    expect(wheelIndex(5, 5, 6, 20)).toBeNull();
    expect(wheelIndex(50, 0, 0, 20)).toBeNull();
  });

  it('puts each wedge where the pointer picks it', () => {
    for (const count of [2, 3, 6, 8]) {
      for (let i = 0; i < count; i += 1) {
        const a = wheelAngle(i, count);
        expect(wheelIndex(Math.cos(a) * 60, Math.sin(a) * 60, count, 20)).toBe(i);
      }
    }
  });
});
