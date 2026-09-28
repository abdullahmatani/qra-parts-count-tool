import { describe, expect, it } from 'vitest';
import { makeCircleMarker, makeSegment } from '@/test/fixtures';
import type { CircleGeometry, Marker, MarkerGeometry, Point } from '../schema/types';
import { newEsdvData } from '../esdv';
import {
  highlightOf,
  highlightedSegmentAt,
  highlightsOn,
  isEquipmentMarker,
  outlinesArea,
  segmentUnder,
} from './highlighted-segment';

const DRAWING = 'drw_1';
const segments = {
  A: makeSegment({ id: 'A', label: 'IS-01' }),
  B: makeSegment({ id: 'B', label: 'IS-02', colour: 2 }),
};

function highlight(id: string, segmentId: string | null, geometry: MarkerGeometry): Marker {
  return makeCircleMarker(DRAWING, {
    id,
    segmentId,
    shape: geometry.type === 'stroke' ? 'highlighter' : 'dashedHighlight',
    geometry,
  });
}

const stroke = (points: Point[], width = 10): MarkerGeometry => ({ type: 'stroke', points, width });
const run = (points: Point[]): MarkerGeometry => ({ type: 'polyline', points });
const rect = (x: number, y: number, width: number, height: number): MarkerGeometry => ({
  type: 'rect',
  x,
  y,
  width,
  height,
});
const ring = (cx: number, cy: number, r = 4): CircleGeometry => ({ type: 'circle', cx, cy, r });

function under(markers: Marker[], circle: CircleGeometry): string | null {
  const doc = { markers: Object.fromEntries(markers.map((m) => [m.id, m])), segments };
  return highlightedSegmentAt(doc, DRAWING, circle);
}

describe('highlighted segments (SEG-06)', () => {
  it('puts equipment on a highlighter stroke in its segment, but not beside it', () => {
    const pipe = [
      highlight(
        'hl',
        'A',
        stroke([
          [0, 100],
          [400, 100],
        ]),
      ),
    ];
    expect(under(pipe, ring(200, 104))).toBe('A');
    // Just off the paint (half the 10-unit pen), even when the ring touches it.
    expect(under(pipe, ring(200, 106, 20))).toBeNull();
    expect(under(pipe, ring(450, 100))).toBeNull();
  });

  it('puts equipment on a traced line run when its ring reaches the line', () => {
    const line = [
      highlight(
        'run',
        'B',
        run([
          [0, 0],
          [100, 0],
          [100, 100],
        ]),
      ),
    ];
    expect(under(line, ring(50, 3, 4))).toBe('B');
    expect(under(line, ring(103, 50, 4))).toBe('B');
    expect(under(line, ring(50, 5, 4))).toBeNull();
    // An open run encloses nothing.
    expect(under(line, ring(60, 40, 4))).toBeNull();
  });

  it('puts equipment inside a zone in its segment', () => {
    const zones = [
      highlight('box', 'A', rect(0, 0, 100, 100)),
      // Clicked round an area, ending where it began.
      highlight(
        'outline',
        'B',
        run([
          [200, 0],
          [300, 0],
          [300, 100],
          [200, 100],
          [201, 1],
        ]),
      ),
    ];
    expect(under(zones, ring(50, 50))).toBe('A');
    expect(under(zones, ring(250, 50))).toBe('B');
    expect(under(zones, ring(150, 50))).toBeNull();
  });

  it('prefers the pipework to a zone, the nearest pipe, and the smallest zone', () => {
    const markers = [
      highlight('area', 'A', rect(0, 0, 400, 400)),
      highlight('room', 'B', rect(100, 100, 100, 100)),
      highlight(
        'pipeA',
        'A',
        stroke([
          [0, 150],
          [400, 150],
        ]),
      ),
      highlight(
        'pipeB',
        'B',
        stroke([
          [0, 158],
          [400, 158],
        ]),
      ),
    ];
    expect(under(markers, ring(150, 120))).toBe('B');
    expect(under(markers, ring(50, 50))).toBe('A');
    expect(under(markers, ring(300, 152))).toBe('A');
    expect(under(markers, ring(300, 156))).toBe('B');
  });

  it('ignores unassigned highlights, other drawings and markers that are not highlights', () => {
    const markers = [
      highlight(
        'loose',
        null,
        stroke([
          [0, 0],
          [100, 0],
        ]),
      ),
      highlight(
        'gone',
        'deleted',
        stroke([
          [0, 0],
          [100, 0],
        ]),
      ),
      {
        ...highlight(
          'elsewhere',
          'A',
          stroke([
            [0, 0],
            [100, 0],
          ]),
        ),
        drawingId: 'drw_2',
      },
      makeCircleMarker(DRAWING, { id: 'valve', segmentId: 'A', geometry: ring(50, 0, 20) }),
    ];
    expect(under(markers, ring(50, 0))).toBeNull();
    const doc = { markers: Object.fromEntries(markers.map((m) => [m.id, m])), segments };
    expect(highlightsOn(doc, DRAWING)).toEqual([]);
    expect(highlightOf(doc, markers[2]!)).toMatchObject({ segmentId: 'A', zone: false });
  });

  it('knows a zone outline from a line run', () => {
    expect(
      outlinesArea([
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 2],
      ]),
    ).toBe(true);
    expect(
      outlinesArea([
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]),
    ).toBe(false);
    expect(
      outlinesArea([
        [0, 0],
        [100, 0],
        [0, 0],
      ]),
    ).toBe(false);
    expect(segmentUnder([], ring(0, 0))).toBeNull();
  });

  it('only moves equipment with the highlighting, not ESDVs or highlights', () => {
    expect(isEquipmentMarker(makeCircleMarker(DRAWING))).toBe(true);
    expect(isEquipmentMarker(makeCircleMarker(DRAWING, { esdv: newEsdvData('in') }))).toBe(false);
    expect(
      isEquipmentMarker(
        highlight(
          'hl',
          'A',
          stroke([
            [0, 0],
            [1, 1],
          ]),
        ),
      ),
    ).toBe(false);
  });
});
