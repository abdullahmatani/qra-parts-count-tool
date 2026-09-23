import { describe, expect, it } from 'vitest';
import { ESDV_COLOUR, SEGMENT_PALETTE, UNASSIGNED_COLOUR } from '../palette';
import { makeCircleMarker, makeItem, makeSegment } from '@/test/fixtures';
import {
  NO_FILTERS,
  countMarkerWarnings,
  isMarkerVisible,
  itemsByMarker,
  markerLabel,
  markerPaint,
  markerWarnings,
} from './presentation';

const segment = makeSegment({ id: 'seg_a', colour: 2 });
const other = makeSegment({ id: 'seg_b', label: 'IS-02', colour: 14 });
const esdv = {
  tag: 'ESDV-101',
  nominalSize: 12,
  sizeUnit: 'in' as const,
  upstreamSegmentId: 'seg_a',
  downstreamSegmentId: 'seg_b',
  boundaryRuleOverride: null,
};

describe('marker colour (ANN-03)', () => {
  it('uses the segment colour, and the dash variant once the palette has cycled', () => {
    const segments = { seg_a: segment, seg_b: other };
    expect(markerPaint(makeCircleMarker('d', { segmentId: 'seg_a' }), segments)).toEqual({
      colour: SEGMENT_PALETTE[1],
      dash: [],
    });
    expect(markerPaint(makeCircleMarker('d', { segmentId: 'seg_b' }), segments)).toEqual({
      colour: SEGMENT_PALETTE[1],
      dash: [6, 3],
    });
  });

  it('shows ESDVs in red and unassigned markers in grey', () => {
    expect(markerPaint(makeCircleMarker('d', { esdv }), {}).colour).toBe(ESDV_COLOUR);
    expect(markerPaint(makeCircleMarker('d'), {}).colour).toBe(UNASSIGNED_COLOUR);
    expect(markerPaint(makeCircleMarker('d', { segmentId: 'gone' }), {}).colour).toBe(
      UNASSIGNED_COLOUR,
    );
  });
});

describe('labels (ANN-05)', () => {
  it('shows the tag, otherwise the item number', () => {
    const marker = makeCircleMarker('d');
    expect(markerLabel(marker, undefined)).toBe('');
    expect(markerLabel(marker, makeItem(marker, 7))).toBe('#7');
    expect(markerLabel(marker, makeItem(marker, 7, { tag: 'HV-101' }))).toBe('HV-101');
    expect(markerLabel(makeCircleMarker('d', { esdv }), undefined)).toBe('ESDV-101');
  });
});

describe('filters (ANN-06)', () => {
  const assigned = makeCircleMarker('d', { segmentId: 'seg_a' });
  const unassigned = makeCircleMarker('d');
  const valve = makeItem(assigned, 1, { equipmentTypeId: 'eqt_valve' });

  it('shows everything with no filters', () => {
    expect(isMarkerVisible(assigned, valve, NO_FILTERS)).toBe(true);
    expect(isMarkerVisible(unassigned, undefined, NO_FILTERS)).toBe(true);
  });

  it('hides by segment, by the unassigned key and by equipment type', () => {
    const f = { ...NO_FILTERS, hiddenSegments: ['seg_a'] };
    expect(isMarkerVisible(assigned, valve, f)).toBe(false);
    expect(isMarkerVisible(unassigned, undefined, f)).toBe(true);
    const g = { ...NO_FILTERS, hiddenSegments: ['unassigned'] };
    expect(isMarkerVisible(unassigned, undefined, g)).toBe(false);
    const h = { ...NO_FILTERS, hiddenTypes: ['eqt_valve'] };
    expect(isMarkerVisible(assigned, valve, h)).toBe(false);
    expect(isMarkerVisible(assigned, undefined, h)).toBe(true);
  });

  it('shows only unassigned markers on request', () => {
    const f = { ...NO_FILTERS, showUnassignedOnly: true };
    expect(isMarkerVisible(assigned, valve, f)).toBe(false);
    expect(isMarkerVisible(unassigned, undefined, f)).toBe(true);
  });

  it('keeps an ESDV visible while either of its segments is shown', () => {
    const marker = makeCircleMarker('d', { esdv });
    expect(isMarkerVisible(marker, undefined, { ...NO_FILTERS, hiddenSegments: ['seg_a'] })).toBe(
      true,
    );
    expect(
      isMarkerVisible(marker, undefined, { ...NO_FILTERS, hiddenSegments: ['seg_a', 'seg_b'] }),
    ).toBe(false);
  });
});

describe('warnings', () => {
  it('flags unassigned markers', () => {
    const unassigned = makeCircleMarker('d');
    const assigned = makeCircleMarker('d', { segmentId: 'seg_a' });
    expect(markerWarnings(unassigned)).toEqual(['unassigned']);
    expect(markerWarnings(assigned)).toEqual([]);
    expect(
      countMarkerWarnings({ markers: { [unassigned.id]: unassigned, [assigned.id]: assigned } }),
    ).toBe(1);
  });

  it('indexes items by marker', () => {
    const marker = makeCircleMarker('d');
    const item = makeItem(marker, 1);
    expect(itemsByMarker({ [item.id]: item }).get(marker.id)).toBe(item);
  });
});
