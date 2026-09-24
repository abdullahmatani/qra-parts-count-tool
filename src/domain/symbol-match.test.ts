// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  cropInk,
  findMatches,
  inkFromRgba,
  inkImage,
  matchExample,
  removeLongLines,
  rotateInk,
  suppressOverlaps,
  type InkImage,
  type SymbolMatch,
} from './symbol-match';

/** Paints ink wherever `inside(x, y)` holds. */
function paint(image: InkImage, inside: (x: number, y: number) => boolean): void {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (inside(x + 0.5, y + 0.5)) image.data[y * image.width + x] = 1;
    }
  }
}

const triangle = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const sign = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  return (x: number, y: number) => {
    const d1 = sign(x, y, ax, ay, bx, by);
    const d2 = sign(x, y, bx, by, cx, cy);
    const d3 = sign(x, y, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
};

/** A gate valve: two triangles meeting at (x, y), across a pipe; `vertical` turns it 90°. */
function valve(image: InkImage, x: number, y: number, vertical = false): void {
  const [a, b] = vertical
    ? [triangle(x - 7, y - 14, x + 7, y - 14, x, y), triangle(x - 7, y + 14, x + 7, y + 14, x, y)]
    : [triangle(x - 14, y - 7, x - 14, y + 7, x, y), triangle(x + 14, y - 7, x + 14, y + 7, x, y)];
  const pipe = vertical
    ? (px: number, py: number) => Math.abs(px - x) < 1 && Math.abs(py - y) < 22
    : (px: number, py: number) => Math.abs(py - y) < 1 && Math.abs(px - x) < 22;
  paint(image, (px, py) => a(px, py) || b(px, py) || pipe(px, py));
}

function ring(image: InkImage, x: number, y: number, r: number): void {
  paint(image, (px, py) => Math.abs(Math.hypot(px - x, py - y) - r) < 1);
}

function near(matches: readonly SymbolMatch[], x: number, y: number, tolerance = 4): boolean {
  return matches.some(
    (m) =>
      Math.abs(m.x + m.width / 2 - x) <= tolerance && Math.abs(m.y + m.height / 2 - y) <= tolerance,
  );
}

describe('symbol matching (roadmap #59)', () => {
  it('reads ink from canvas pixels', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]);
    expect([...inkFromRgba(rgba, 3, 1).data]).toEqual([0, 1, 0]);
  });

  it('turns images clockwise in quarter turns', () => {
    const image = inkImage(3, 2, Float32Array.from([1, 2, 3, 4, 5, 6]));
    const quarter = rotateInk(image, 90);
    expect([quarter.width, quarter.height]).toEqual([2, 3]);
    expect([...quarter.data]).toEqual([4, 1, 5, 2, 6, 3]);
    expect([...rotateInk(image, 180).data]).toEqual([6, 5, 4, 3, 2, 1]);
    expect([...rotateInk(quarter, 270).data]).toEqual([...image.data]);
  });

  it('crops to the image', () => {
    const image = inkImage(
      4,
      4,
      Float32Array.from({ length: 16 }, (_, i) => i),
    );
    const crop = cropInk(image, 2, 2, 5, 5);
    expect([crop.width, crop.height, ...crop.data]).toEqual([2, 2, 10, 11, 14, 15]);
  });

  it('finds the same symbol elsewhere, turned 90°, and not other symbols', () => {
    const image = inkImage(420, 260);
    const valves: [number, number, boolean][] = [
      [60, 60, false],
      [200, 60, false],
      [340, 190, false],
      [120, 190, true],
    ];
    for (const [x, y, vertical] of valves) valve(image, x, y, vertical);
    ring(image, 300, 70, 16);
    ring(image, 230, 200, 12);
    paint(image, (x, y) => x > 20 && x < 400 && Math.abs(y - 130) < 1);

    const template = cropInk(image, 60 - 18, 60 - 18, 36, 36);
    const matches = findMatches(image, template, { minScore: 0.7 });
    for (const [x, y] of valves) expect(near(matches, x, y), `valve at ${x}, ${y}`).toBe(true);
    expect(near(matches, 300, 70, 10)).toBe(false);
    expect(near(matches, 230, 200, 10)).toBe(false);
    expect(matches).toHaveLength(4);
    const turned = matches.find((m) => near([m], 120, 190))!;
    expect([90, 270]).toContain(turned.rotation);
    expect(matches[0]!.score).toBeGreaterThan(0.95);
  });

  it('removes long straight lines but keeps short strokes', () => {
    const image = inkImage(60, 40);
    paint(image, (x, y) => Math.abs(y - 10) < 1 || (Math.abs(x - 30) < 1 && y > 20 && y < 30));
    const clean = removeLongLines(image, 20);
    expect(clean.data.slice(10 * 60, 11 * 60).every((v) => v === 0)).toBe(true);
    expect(clean.data[25 * 60 + 30]).toBe(1);
  });

  it('matches a valve on a line running the other way (roadmap #59)', () => {
    // Both valves are drawn the same way; one sits on a horizontal pipe, one on a vertical drain.
    const image = inkImage(300, 200);
    const a = [triangle(46, 43, 46, 57, 60, 50), triangle(74, 43, 74, 57, 60, 50)];
    const b = [triangle(186, 133, 186, 147, 200, 140), triangle(214, 133, 214, 147, 200, 140)];
    paint(
      image,
      (x, y) =>
        [...a, ...b].some((inside) => inside(x, y)) ||
        (Math.abs(y - 50) < 1 && x > 5 && x < 150) ||
        (Math.abs(x - 200) < 1 && y > 60 && y < 195),
    );
    const box = { x: 60 - 18, y: 50 - 18, width: 36, height: 36 };
    const matches = matchExample(image, box, { minScore: 0.6 });
    const other = matches.find((m) => near([m], 200, 140));
    expect(other?.score).toBeGreaterThan(0.8);
    expect(matches).toHaveLength(2);
  });

  it('keeps only the best of overlapping matches', () => {
    const box = (x: number, score: number): SymbolMatch => ({
      x,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      score,
    });
    expect(suppressOverlaps([box(0, 0.8), box(3, 0.9), box(30, 0.7)])).toEqual([
      box(3, 0.9),
      box(30, 0.7),
    ]);
    // Half a box apart is still the same symbol; boxes that only touch are not.
    expect(suppressOverlaps([box(0, 0.9), box(6, 0.8), box(10, 0.7)])).toEqual([
      box(0, 0.9),
      box(10, 0.7),
    ]);
    // Nothing over a symbol that is already counted.
    expect(suppressOverlaps([box(0, 0.9), box(30, 0.7)], [box(28, 1)])).toEqual([box(0, 0.9)]);
  });

  it('searches an A3 sheet at working resolution within a couple of seconds', () => {
    // 1191 × 842 pt at 1.33 px/pt, with a 32 px symbol, like a PEFS sheet.
    const image = inkImage(1588, 1123);
    for (let i = 0; i < 40; i += 1)
      valve(image, 60 + (i % 10) * 150, 80 + Math.floor(i / 10) * 250);
    paint(image, (x, y) => Math.abs((y % 250) - 80) < 1 || Math.abs((x % 400) - 130) < 1);
    const template = cropInk(image, 60 - 18, 80 - 18, 36, 36);
    const started = performance.now();
    const matches = findMatches(image, template, { minScore: 0.7 });
    const elapsed = performance.now() - started;
    expect(matches).toHaveLength(40);
    expect(elapsed).toBeLessThan(4000);
  });
});
