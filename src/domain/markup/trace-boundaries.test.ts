import { describe, expect, it } from 'vitest';
import { makeCircleMarker } from '@/test/fixtures';
import type { DrawingLink, Marker, StrokeGeometry } from '../schema/types';
import { barrierDistance } from './auto-trace';
import { hasTraceBoundaries, paintedShare, traceBoundaries } from './trace-boundaries';

const ring = makeCircleMarker('d', {
  id: 'ring',
  geometry: { type: 'circle', cx: 100, cy: 50, r: 10 },
  esdv: {
    tag: 'ESDV-1',
    nominalSize: null,
    sizeUnit: 'in',
    upstreamSegmentId: 'up',
    downstreamSegmentId: null,
    boundaryRuleOverride: null,
  },
});
const flange = makeCircleMarker('d', {
  id: 'flange',
  segmentId: 'seg',
  shape: 'endFlange',
  geometry: {
    type: 'doubleLine',
    points: [
      [200, 40],
      [200, 60],
    ],
    gap: 4,
  },
  endFlange: { tag: '', destination: 'flare' },
});
const link: DrawingLink = {
  id: 'link',
  sourceDrawingId: 'd',
  rect: { x: 300, y: 40, width: 40, height: 20 },
  targetDrawingId: null,
  targetView: null,
  label: '',
};
const markers: Record<string, Marker> = {
  ring,
  flange,
  valve: makeCircleMarker('d', { id: 'valve' }),
  elsewhere: { ...ring, id: 'elsewhere', drawingId: 'other' },
};

describe('what the auto trace stops at', () => {
  it('takes the ESDVs, end flanges and links of a drawing, in pixels', () => {
    const { barriers, sides, links } = traceBoundaries({ markers, links: { link } }, 'd', 2);
    expect(barriers.map((b) => b.id)).toEqual(['ring', 'flange', 'link']);
    expect(links).toEqual(['link']);
    expect(sides).toEqual([
      { id: 'ring', sides: ['up', null] },
      { id: 'flange', sides: ['seg'], endFlange: true },
    ]);
    const [disc, bar, box] = barriers.map((b) => b.shape);
    expect(barrierDistance(disc!, { x: 200, y: 100 })).toBe(0);
    expect(barrierDistance(disc!, { x: 230, y: 100 })).toBeCloseTo(10);
    // The bar runs along its points, as thick as its gap.
    expect(barrierDistance(bar!, { x: 400, y: 81 })).toBe(0);
    expect(barrierDistance(bar!, { x: 406, y: 100 })).toBeCloseTo(2);
    expect(barrierDistance(box!, { x: 639, y: 119 })).toBe(0);
    expect(barrierDistance(box!, { x: 690, y: 100 })).toBeCloseTo(10);
  });

  it('is there to trace to once a drawing has a boundary or a link', () => {
    expect(hasTraceBoundaries({ markers: { valve: markers.valve! }, links: {} }, 'd')).toBe(false);
    expect(hasTraceBoundaries({ markers, links: {} }, 'd')).toBe(true);
    expect(hasTraceBoundaries({ markers: {}, links: { link } }, 'd')).toBe(true);
  });

  it('measures how much of a path is painted already', () => {
    const stroke: StrokeGeometry = {
      type: 'stroke',
      points: [
        [0, 0],
        [100, 0],
      ],
      width: 8,
    };
    expect(
      paintedShare(
        [
          [0, 1],
          [100, 1],
        ],
        [stroke],
      ),
    ).toBe(1);
    expect(
      paintedShare(
        [
          [100, 0],
          [200, 0],
        ],
        [stroke],
      ),
    ).toBe(0);
    expect(
      paintedShare(
        [
          [0, 0],
          [100, 0],
          [100, 100],
        ],
        [stroke],
      ),
    ).toBe(0.5);
    expect(
      paintedShare(
        [
          [0, 20],
          [100, 20],
        ],
        [stroke],
      ),
    ).toBe(0);
  });
});
