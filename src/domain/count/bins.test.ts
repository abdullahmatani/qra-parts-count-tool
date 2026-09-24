import { describe, expect, it } from 'vitest';
import type { Bin } from '../schema/types';
import { binContains, binFor, binLabel, checkBinSet } from './bins';
import { starterLibrary } from './starter-library';

const bin = (
  id: string,
  lower: number | null,
  upper: number | null,
  lowerInclusive = false,
  upperInclusive = true,
): Bin => ({ id, label: id, lower, upper, lowerInclusive, upperInclusive });

describe('size bins (CNT-04, CNT-05)', () => {
  it('honours explicit edge rules', () => {
    const b = bin('1-2', 1, 2);
    expect(binContains(b, 1)).toBe(false);
    expect(binContains(b, 1.5)).toBe(true);
    expect(binContains(b, 2)).toBe(true);
    expect(binContains(bin('x', 1, 2, true, false), 1)).toBe(true);
    expect(binContains(bin('x', 1, 2, true, false), 2)).toBe(false);
    expect(binContains(bin('open', null, null), 999)).toBe(true);
  });

  it('assigns each size of the starter bins to exactly one bin', () => {
    const valves = starterLibrary().binSets[0]!;
    const labels = [0.5, 1, 1.5, 2, 3, 6, 8, 11, 12].map((s) => binFor(valves, s)?.label);
    expect(labels).toEqual([
      '≤ 1"',
      '≤ 1"',
      '1" < x ≤ 2"',
      '1" < x ≤ 2"',
      '2" < x ≤ 3"',
      '3" < x ≤ 11"',
      '3" < x ≤ 11"',
      '3" < x ≤ 11"',
      '> 11"',
    ]);
    expect(checkBinSet(valves)).toEqual([]);
  });

  it('returns null for a size outside every bin', () => {
    expect(binFor({ bins: [bin('small', null, 2)] }, 3)).toBeNull();
  });

  it('labels bins from their edges', () => {
    expect(binLabel(bin('x', 0.5, 1))).toBe('1/2" < x ≤ 1"');
    expect(binLabel(bin('x', 2, null, true))).toBe('≥ 2"');
    expect(binLabel(bin('x', null, 1, false, false))).toBe('< 1"');
    expect(binLabel(bin('x', null, null))).toBe('All sizes');
  });

  it('finds gaps, overlaps and empty bins', () => {
    const problems = checkBinSet({
      bins: [bin('a', null, 1), bin('b', 1, 2, true), bin('c', 3, null), bin('d', 5, 5)],
    });
    expect(problems.map((p) => p.kind).sort()).toEqual(['emptyBin', 'gap', 'overlap', 'overlap']);
    // Touching edges where neither side includes the edge value leave a gap at that value.
    expect(checkBinSet({ bins: [bin('a', null, 1, false, false), bin('b', 1, null)] })).toEqual([
      { kind: 'gap', binIds: ['a', 'b'], from: 1, to: 1 },
    ]);
  });
});

describe('starter library (CNT-02)', () => {
  it('matches the rows of the A2.1 parts count sheet without naming a dataset', () => {
    const library = starterLibrary();
    expect(library.datasetName).toBe('');
    expect(library.equipmentTypes.map((t) => t.excelKey)).toEqual([
      'valve',
      'flange',
      'smallBore',
      'compressorCentrifugal',
      'compressorReciprocating',
      'finFanCooler',
      'heatExchangerShell',
      'heatExchangerTube',
      'vessel',
      'pumpDoubleSeal',
      'pumpSingleSeal',
      'pumpReciprocating',
      'pipeline',
      'pigTrap',
      'xmasTreeLow',
      'xmasTreeHigh',
      'plateHeatExchanger',
      'pipe',
    ]);
    const smallBore = library.binSets.find((b) => b.name === 'Small-bore connections')!;
    expect(smallBore.bins.map((b) => b.label)).toEqual(['≤ 1/2"', '1/2" < x ≤ 1"', '> 1"']);
  });
});
