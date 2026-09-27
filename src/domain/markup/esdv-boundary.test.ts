import { describe, expect, it } from 'vitest';
import type { CircleGeometry, DoubleLineGeometry, StrokeGeometry } from '../schema/types';
import {
  cutStroke,
  doubleLine,
  doubleLineAt,
  doubleLineForClick,
  doubleLineGap,
  pathOutside,
  cutRegion,
  snapAngle,
  snapToEsdv,
} from './esdv-boundary';

type Path = [number, number][];

function stroke(points: Path, width = 10): StrokeGeometry {
  return { type: 'stroke', points, width };
}

const paths = (pieces: StrokeGeometry[] | null) => pieces?.map((p) => p.points) ?? null;

/** A ring of radius 10 on a horizontal pipe at y = 0. */
const ring: CircleGeometry = { type: 'circle', cx: 50, cy: 0, r: 10 };
/** A double line 40 long across the same pipe, its lines 6 apart. */
const bar: DoubleLineGeometry = doubleLine({ x: 50, y: -20 }, { x: 50, y: 20 }, 6);

describe('double lines', () => {
  it('sizes the gap to the sheet', () => {
    expect(doubleLineGap({ width: 2384, height: 1684 })).toBeCloseTo(9.536);
  });

  it('builds a double line round its centre at an angle', () => {
    const upright = doubleLineAt({ x: 10, y: 10 }, Math.PI / 2, 8, 2);
    expect(upright.points[0][0]).toBeCloseTo(10);
    expect(upright.points[0][1]).toBeCloseTo(6);
    expect(upright.points[1][1]).toBeCloseTo(14);
    expect(upright.gap).toBe(2);
  });

  it('turns to multiples of 45° with Shift', () => {
    expect(snapAngle(0.3)).toBe(0);
    expect(snapAngle(0.5)).toBeCloseTo(Math.PI / 4);
    expect(snapAngle(-1.4)).toBeCloseTo(-Math.PI / 2);
  });

  it('crosses the highlighter stroke under a click, and uses the last size elsewhere', () => {
    const pipe = stroke([
      [0, 0],
      [100, 0],
    ]);
    const last = { angle: 0, length: 8 };
    // Square across the stroke, centred on it, longer than the stroke is wide.
    const across = doubleLineForClick({ x: 30, y: 3 }, [pipe], last, 2, 1);
    expect(across.points[0][0]).toBeCloseTo(30);
    expect(across.points[1][0]).toBeCloseTo(30);
    expect((across.points[0][1] + across.points[1][1]) / 2).toBeCloseTo(0);
    expect(Math.abs(across.points[1][1] - across.points[0][1])).toBeCloseTo(15);
    // Away from any stroke: the last angle and length, centred on the click.
    const alone = doubleLineForClick({ x: 30, y: 40 }, [pipe], last, 2, 1);
    expect(alone.points[0]).toEqual([26, 40]);
    expect(alone.points[1]).toEqual([34, 40]);
  });
});

describe('cutting highlighter strokes at ESDVs', () => {
  it('cuts a stroke through a ring into a piece on each side, clear of the ring', () => {
    // The pen is 10 wide: its round ends stop at the ring (radius 10 + 5).
    expect(
      paths(
        cutStroke(
          stroke([
            [0, 0],
            [100, 0],
          ]),
          [ring],
        ),
      ),
    ).toEqual([
      [
        [0, 0],
        [35, 0],
      ],
      [
        [65, 0],
        [100, 0],
      ],
    ]);
  });

  it('cuts a stroke across a double line between its lines', () => {
    const pieces = cutStroke(
      stroke([
        [0, 0],
        [40, 0],
        [60, 0],
        [100, 0],
      ]),
      [bar],
    );
    // The pen reaches 5 either side of the path, the lines are 3 either side of the pipe.
    expect(paths(pieces)).toEqual([
      [
        [0, 0],
        [40, 0],
        [42, 0],
      ],
      [
        [58, 0],
        [60, 0],
        [100, 0],
      ],
    ]);
    expect(pieces!.every((piece) => piece.width === 10)).toBe(true);
  });

  it('trims a stroke that ends on an ESDV', () => {
    expect(
      paths(
        cutStroke(
          stroke([
            [50, 0],
            [50, 60],
          ]),
          [ring],
        ),
      ),
    ).toEqual([
      [
        [50, 15],
        [50, 60],
      ],
    ]);
  });

  it('cuts at each ESDV and each crossing', () => {
    const second: CircleGeometry = { ...ring, cx: 150 };
    expect(
      cutStroke(
        stroke([
          [0, 0],
          [200, 0],
        ]),
        [ring, second],
      ),
    ).toHaveLength(3);
    // A stroke that doubles back across a double line is cut both times.
    expect(
      cutStroke(
        stroke([
          [0, 0],
          [100, 0],
          [100, 10],
          [0, 10],
        ]),
        [bar],
      ),
    ).toHaveLength(3);
  });

  it('leaves a stroke alone when it misses the ESDVs or lies inside one', () => {
    // Past the end of the double line (and its pen reach).
    expect(
      cutStroke(
        stroke([
          [0, 40],
          [100, 40],
        ]),
        [bar],
      ),
    ).toBeNull();
    expect(
      cutStroke(
        stroke([
          [45, 0],
          [55, 0],
        ]),
        [ring],
      ),
    ).toBeNull();
    expect(
      cutStroke(
        stroke([
          [0, 0],
          [100, 0],
        ]),
        [],
      ),
    ).toBeNull();
  });

  it('drops crumbs shorter than half the pen', () => {
    expect(
      paths(
        cutStroke(
          stroke([
            [32, 0],
            [100, 0],
          ]),
          [ring],
        ),
      ),
    ).toEqual([
      [
        [65, 0],
        [100, 0],
      ],
    ]);
  });

  it('reports the parts of a path outside a region, or null when it never enters', () => {
    const region = cutRegion(ring, 0);
    expect(
      pathOutside(
        [
          { x: 0, y: 0 },
          { x: 0, y: 50 },
        ],
        [region],
      ),
    ).toBeNull();
    // A tangent touch is not a crossing.
    expect(
      pathOutside(
        [
          { x: 0, y: 10 },
          { x: 100, y: 10 },
        ],
        [region],
      ),
    ).toBeNull();
    expect(
      pathOutside(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        [region],
      ),
    ).toEqual([
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      [
        { x: 60, y: 0 },
        { x: 100, y: 0 },
      ],
    ]);
  });
});

describe('the highlighter magnet', () => {
  const markers = [
    { id: 'ring', geometry: ring },
    { id: 'bar', geometry: doubleLine({ x: 150, y: -20 }, { x: 150, y: 20 }, 6) },
    { id: 'valve', geometry: { type: 'rect' as const, x: 0, y: 0, width: 5, height: 5 } },
  ];

  it('snaps to the centre of a ring the pointer is near', () => {
    expect(snapToEsdv(markers, { x: 63, y: 4 }, 5)).toMatchObject({
      marker: { id: 'ring' },
      point: { x: 50, y: 0 },
    });
    expect(snapToEsdv(markers, { x: 70, y: 0 }, 5)).toBeNull();
  });

  it('snaps to the point of a double line level with the pointer', () => {
    expect(snapToEsdv(markers, { x: 156, y: 8 }, 5)).toMatchObject({
      marker: { id: 'bar' },
      point: { x: 150, y: 8 },
    });
    // Beyond its ends it holds on to the end.
    expect(snapToEsdv(markers, { x: 150, y: 23 }, 5)?.point).toEqual({ x: 150, y: 20 });
  });

  it('ignores markers that are not ESDV shapes', () => {
    expect(snapToEsdv(markers, { x: 2, y: 2 }, 5)).toBeNull();
  });
});
