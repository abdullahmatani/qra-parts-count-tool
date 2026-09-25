import { describe, expect, it } from 'vitest';
import { HIGHLIGHTER_PENS, penWidth, strokePen } from './highlighter';

describe('highlighter pens', () => {
  const a1 = { width: 2384, height: 1684 };

  it('scales with the sheet, so a stroke covers the same part of it at any zoom', () => {
    expect(penWidth('medium', a1)).toBeCloseTo(2384 / 150);
    expect(penWidth('broad', a1)).toBeCloseTo(2 * penWidth('medium', a1));
    expect(penWidth('fine', { width: 842, height: 1191 })).toBeCloseTo(1191 / 300);
  });

  it('finds the pen a stroke was painted with, or none', () => {
    for (const pen of HIGHLIGHTER_PENS) {
      const stroke = {
        type: 'stroke' as const,
        points: [
          [0, 0],
          [1, 1],
        ] as [number, number][],
        width: penWidth(pen, a1),
      };
      expect(strokePen(stroke, a1)).toBe(pen);
    }
    expect(
      strokePen(
        {
          type: 'stroke',
          points: [
            [0, 0],
            [1, 1],
          ],
          width: 3,
        },
        a1,
      ),
    ).toBeNull();
  });
});
