import { describe, expect, it } from 'vitest';
import {
  liquidOrGas,
  pressureToBara,
  temperatureToCelsius,
  unconvertedValues,
} from './process-units';

describe('process data in template units (A2.1)', () => {
  it('converts pressures to bara from common units', () => {
    expect(pressureToBara(45, 'barg')).toBe(46.01325);
    expect(pressureToBara(45, 'bar(g)')).toBe(46.01325);
    expect(pressureToBara(45, 'bara')).toBe(45);
    expect(pressureToBara(100, 'psig')).toBeCloseTo(7.908, 4);
    expect(pressureToBara(500, 'kPa(g)')).toBe(6.01325);
    expect(pressureToBara(2, 'MPa')).toBe(20);
    expect(pressureToBara(45, 'atm')).toBeNull();
    expect(pressureToBara(null, 'barg')).toBeNull();
  });

  it('converts temperatures to °C', () => {
    expect(temperatureToCelsius(60, '°C')).toBe(60);
    expect(temperatureToCelsius(212, '°F')).toBe(100);
    expect(temperatureToCelsius(300, 'K')).toBe(26.85);
    expect(temperatureToCelsius(60, 'R')).toBeNull();
  });

  it('reads the phase as Liquid or Gas where it is one of them', () => {
    expect(
      ['Gas', 'gas / condensate', 'Vapour', 'Liquid', 'Oil', 'condensate'].map(liquidOrGas),
    ).toEqual(['Gas', 'Gas', 'Gas', 'Liquid', 'Liquid', 'Liquid']);
    expect(liquidOrGas('Two-phase')).toBeNull();
    expect(liquidOrGas('')).toBeNull();
  });

  it('lists the values a template cannot be given (EXP-01)', () => {
    const segments = [
      { label: 'IS-01', phase: 'Two-phase', pressure: 45, temperature: 60 },
      { label: 'IS-02', phase: 'Gas', pressure: 44, temperature: 55 },
    ];
    const all = { phaseLiquidGas: true, pressureBara: true, temperatureC: true };
    expect(unconvertedValues(segments, { pressure: 'barg', temperature: '°C' }, all)).toEqual([
      'IS-01: Two-phase',
    ]);
    expect(unconvertedValues(segments, { pressure: 'atm', temperature: '°C' }, all)).toEqual([
      'IS-01: Two-phase',
      'IS-01: 45 atm',
      'IS-02: 44 atm',
    ]);
    // Only the fields the mapping uses matter.
    expect(unconvertedValues(segments, { pressure: 'atm', temperature: '°C' }, {})).toEqual([]);
  });
});
