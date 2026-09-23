import { describe, expect, it } from 'vitest';
import { effectiveBoundaryRule, esdvCountingSegmentIds, newEsdvData } from './esdv';

const esdv = (overrides: Partial<ReturnType<typeof newEsdvData>> = {}) => ({
  esdv: {
    ...newEsdvData('in'),
    upstreamSegmentId: 'up',
    downstreamSegmentId: 'down',
    ...overrides,
  },
});

describe('ESDV boundary rule (SEG-08)', () => {
  it('counts the ESDV where the project rule says', () => {
    expect(esdvCountingSegmentIds(esdv(), 'upstream')).toEqual(['up']);
    expect(esdvCountingSegmentIds(esdv(), 'downstream')).toEqual(['down']);
    expect(esdvCountingSegmentIds(esdv(), 'both')).toEqual(['up', 'down']);
    expect(esdvCountingSegmentIds(esdv(), 'neither')).toEqual([]);
  });

  it('lets each ESDV override the project rule', () => {
    const marker = esdv({ boundaryRuleOverride: 'downstream' });
    expect(effectiveBoundaryRule(marker.esdv, 'upstream')).toBe('downstream');
    expect(esdvCountingSegmentIds(marker, 'upstream')).toEqual(['down']);
  });

  it('counts nowhere without a rule, a side or an ESDV', () => {
    expect(esdvCountingSegmentIds(esdv(), null)).toEqual([]);
    expect(esdvCountingSegmentIds(esdv({ upstreamSegmentId: null }), 'upstream')).toEqual([]);
    expect(esdvCountingSegmentIds({ esdv: null }, 'both')).toEqual([]);
  });
});
