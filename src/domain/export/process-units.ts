/**
 * Process data in the units a template asks for (A2.1 parts count sheet:
 * pressure in bara, temperature in °C, phase "Liquid" or "Gas"). Segments
 * hold values in the project's units, which are free text; the common ones
 * are recognised, and anything else is left for the user to fix.
 */

const ATMOSPHERE_BAR = 1.01325;

/** Keeps exported values tidy: 43.51325, not 43.513250000000006. */
function tidy(value: number): number {
  return Number(value.toPrecision(10));
}

function unitKey(unit: string): string {
  return unit.toLowerCase().replace(/[\s().°_-]/g, '');
}

/** Pressure in bara, or null when the unit is not recognised. */
export function pressureToBara(value: number | null, unit: string): number | null {
  if (value === null) return null;
  // "barg", "bar(a)", "psig", "kPa g", "MPa": a unit, then g (gauge) or a (absolute, the default).
  const m = /^(bar|psi|kpa|mpa|pa)([ag])?$/.exec(unitKey(unit));
  if (!m) return null;
  const factor: Record<string, number> = {
    bar: 1,
    psi: 0.0689475729,
    kpa: 0.01,
    mpa: 10,
    pa: 1e-5,
  };
  return tidy(value * factor[m[1]!]! + (m[2] === 'g' ? ATMOSPHERE_BAR : 0));
}

/** Temperature in °C, or null when the unit is not recognised. */
export function temperatureToCelsius(value: number | null, unit: string): number | null {
  if (value === null) return null;
  switch (unitKey(unit)) {
    case 'c':
    case 'degc':
    case 'celsius':
      return value;
    case 'f':
    case 'degf':
    case 'fahrenheit':
      return tidy(((value - 32) * 5) / 9);
    case 'k':
    case 'kelvin':
      return tidy(value - 273.15);
    default:
      return null;
  }
}

/** "Liquid" or "Gas" from a segment's phase text, or null when it is neither (e.g. two-phase). */
export function liquidOrGas(phase: string): 'Liquid' | 'Gas' | null {
  const text = phase.trim().toLowerCase();
  if (/^(gas|vapou?r|g)\b/.test(text)) return 'Gas';
  if (/^(liquid|liq|l|oil|crude|condensate|water|ngl|lpg)\b/.test(text)) return 'Liquid';
  return null;
}

/**
 * Segment values a template asks for in fixed units that cannot be given
 * (EXP-01), as "IS-01: Two-phase" lines: those cells would stay empty.
 */
export function unconvertedValues(
  segments: readonly {
    label: string;
    phase: string;
    pressure: number | null;
    temperature: number | null;
  }[],
  units: { pressure: string; temperature: string },
  fields: { phaseLiquidGas?: boolean; pressureBara?: boolean; temperatureC?: boolean },
): string[] {
  const out: string[] = [];
  for (const s of segments) {
    if (fields.phaseLiquidGas && s.phase.trim() && liquidOrGas(s.phase) === null) {
      out.push(`${s.label}: ${s.phase.trim()}`);
    }
    if (
      fields.pressureBara &&
      s.pressure !== null &&
      pressureToBara(s.pressure, units.pressure) === null
    ) {
      out.push(`${s.label}: ${s.pressure} ${units.pressure}`);
    }
    if (
      fields.temperatureC &&
      s.temperature !== null &&
      temperatureToCelsius(s.temperature, units.temperature) === null
    ) {
      out.push(`${s.label}: ${s.temperature} ${units.temperature}`);
    }
  }
  return out;
}
