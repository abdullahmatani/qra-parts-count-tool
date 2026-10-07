import { describe, expect, it } from 'vitest';
import type { StrokeGeometry } from '../schema/types';
import { NO_ERASURE, eraseAlong, eraseStroke } from './eraser';

/** A pipe highlighted along y = 100, 10 wide. */
const pipe: StrokeGeometry = {
  type: 'stroke',
  points: [
    [0, 100],
    [400, 100],
  ],
  width: 10,
};

/** The x of each end of each piece. */
function spans(pieces: readonly StrokeGeometry[] | null): [number, number][] | null {
  return pieces && pieces.map((p) => [p.points[0]![0], p.points[p.points.length - 1]![0]]);
}

function expectSpans(pieces: readonly StrokeGeometry[] | null, expected: [number, number][]) {
  const actual = spans(pieces)!;
  expect(actual).toHaveLength(expected.length);
  actual.forEach(([a, b], i) => {
    expect(a).toBeCloseTo(expected[i]![0], 6);
    expect(b).toBeCloseTo(expected[i]![1], 6);
  });
}

describe('eraseStroke', () => {
  it('cuts a stroke across its width where a click touches it, leaving no paint there', () => {
    // Eraser radius 10 plus half the pen: the path stops 15 from the centre.
    const pieces = eraseStroke(pipe, { x: 200, y: 100 }, { x: 200, y: 100 }, 20);
    expectSpans(pieces, [
      [0, 185],
      [215, 400],
    ]);
    // Both pieces keep the pen.
    expect(pieces!.map((p) => p.width)).toEqual([10, 10]);
  });

  it('cuts where the eraser only grazes the edge of the paint', () => {
    // 14 from the line: 4 into the paint (half-width 5) with a radius of 10.
    const half = Math.sqrt(15 ** 2 - 14 ** 2);
    expectSpans(eraseStroke(pipe, { x: 200, y: 114 }, { x: 200, y: 114 }, 20), [
      [0, 200 - half],
      [200 + half, 400],
    ]);
  });

  it('leaves a stroke alone when the eraser misses its paint', () => {
    expect(eraseStroke(pipe, { x: 200, y: 116 }, { x: 200, y: 116 }, 20)).toBeNull();
    expect(eraseStroke(pipe, { x: 200, y: 300 }, { x: 300, y: 300 }, 20)).toBeNull();
  });

  it('rubs out the stretch a drag goes along, and across a stroke', () => {
    expectSpans(eraseStroke(pipe, { x: 100, y: 100 }, { x: 300, y: 100 }, 20), [
      [0, 85],
      [315, 400],
    ]);
    expectSpans(eraseStroke(pipe, { x: 200, y: 0 }, { x: 200, y: 200 }, 20), [
      [0, 185],
      [215, 400],
    ]);
  });

  it('rubs a stroke out altogether, crumbs and all', () => {
    const dab: StrokeGeometry = {
      ...pipe,
      points: [
        [190, 100],
        [210, 100],
      ],
    };
    expect(eraseStroke(dab, { x: 200, y: 100 }, { x: 200, y: 100 }, 20)).toEqual([]);
    // What is left at the start is shorter than half the pen: it goes too.
    expectSpans(eraseStroke(pipe, { x: 17, y: 100 }, { x: 17, y: 100 }, 20), [[32, 400]]);
  });

  it('follows a stroke round its corners', () => {
    const bend: StrokeGeometry = {
      type: 'stroke',
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      width: 10,
    };
    const pieces = eraseStroke(bend, { x: 100, y: 0 }, { x: 100, y: 0 }, 20)!;
    const expected = [
      [
        [0, 0],
        [85, 0],
      ],
      [
        [100, 15],
        [100, 100],
      ],
    ];
    expect(pieces).toHaveLength(expected.length);
    pieces.forEach((piece, i) => {
      expect(piece.points).toHaveLength(expected[i]!.length);
      piece.points.forEach(([x, y], j) => {
        expect(x).toBeCloseTo(expected[i]![j]![0]!, 6);
        expect(y).toBeCloseTo(expected[i]![j]![1]!, 6);
      });
    });
  });
});

describe('eraseAlong', () => {
  const other: StrokeGeometry = {
    ...pipe,
    points: [
      [0, 300],
      [400, 300],
    ],
  };
  const strokes = [
    { id: 'a', geometry: pipe },
    { id: 'b', geometry: other },
  ];

  it('gives back the same erasure when the eraser touches no paint', () => {
    const p = { x: 200, y: 200 };
    expect(eraseAlong(NO_ERASURE, strokes, p, p, 20)).toBe(NO_ERASURE);
  });

  it('keeps what is left of each stroke it goes over, move by move', () => {
    const p = { x: 200, y: 100 };
    const first = eraseAlong(NO_ERASURE, strokes, p, p, 20);
    expect([...first.from]).toEqual([['a', pipe]]);
    expectSpans(first.left.get('a')!, [
      [0, 185],
      [215, 400],
    ]);
    expect(NO_ERASURE.left.size).toBe(0);

    // On along the pipe, then down across the other one.
    const second = eraseAlong(first, strokes, p, { x: 300, y: 100 }, 20);
    expectSpans(second.left.get('a')!, [
      [0, 185],
      [315, 400],
    ]);
    const third = eraseAlong(second, strokes, { x: 300, y: 100 }, { x: 300, y: 300 }, 20);
    expect([...third.from.keys()]).toEqual(['a', 'b']);
    // It was already rubbed out where it went back over the first pipe.
    expectSpans(third.left.get('a')!, [
      [0, 185],
      [315, 400],
    ]);
    expectSpans(third.left.get('b')!, [
      [0, 285],
      [315, 400],
    ]);
    // Over paint already rubbed out, nothing changes.
    expect(eraseAlong(third, strokes, { x: 250, y: 100 }, { x: 250, y: 100 }, 20)).toBe(third);
  });

  it('remembers a stroke that is rubbed out altogether', () => {
    const erased = eraseAlong(NO_ERASURE, strokes, { x: -20, y: 100 }, { x: 420, y: 100 }, 20);
    expect(erased.left.get('a')).toEqual([]);
    expect(erased.from.get('a')).toBe(pipe);
    expect(eraseAlong(erased, strokes, { x: 0, y: 100 }, { x: 0, y: 100 }, 20)).toBe(erased);
  });
});
