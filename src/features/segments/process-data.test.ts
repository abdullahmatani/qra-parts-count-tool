import { describe, expect, it } from 'vitest';
import { makeSegment } from '@/test/fixtures';
import { hasProcessData, processSummary } from './process-data';

const units = { pressure: 'barg', temperature: '°C' };

describe('process data summary', () => {
  it('tells an empty segment from one with any process data', () => {
    expect(hasProcessData(makeSegment())).toBe(false);
    expect(hasProcessData(makeSegment({ streamNumber: '101' }))).toBe(true);
    expect(hasProcessData(makeSegment({ h2sMoleFraction: 0 }))).toBe(true);
  });

  it('puts the main values in one line', () => {
    expect(
      processSummary(
        makeSegment({
          fluid: 'Gas / condensate',
          phase: 'Liquid',
          pressure: 45,
          temperature: -10,
          equipment: 'V-100',
          streamNumber: '101',
        }),
        units,
      ),
    ).toBe('Gas / condensate · Liquid · 45 barg · -10 °C · V-100');
    expect(processSummary(makeSegment({ pressure: 0 }), units)).toBe('0 barg');
    expect(processSummary(makeSegment({ streamNumber: '101' }), units)).toBe('');
  });
});
