import { describe, expect, it } from 'vitest';
import { parseSizeLabel, type SizeLabel } from '../line-labels';
import { TraceGraph, traceSheetFromMask, type TraceBarrier } from './auto-trace';
import type { XY } from './geometry';
import { readLineSizes, type LineSizeReading } from './line-sizes';

/** A blank sheet to draw pipes, symbols and text on, in pixels. */
function sheet(width: number, height: number) {
  const mask = new Uint8Array(width * height);
  const set = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
  };
  const disc = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) set(x, y);
      }
    }
  };
  const line = (a: XY, b: XY, thickness = 3) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let i = 0; i <= steps; i += 1) {
      disc(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, thickness / 2);
    }
  };
  const labels: SizeLabel[] = [];
  return {
    line,
    /** A gate valve: two triangles tip to tip across the pipe, `along` the pipe. */
    valve(cx: number, cy: number, along: 'x' | 'y' = 'x', r = 10) {
      const p = (u: number, v: number) =>
        along === 'x' ? { x: cx + u, y: cy + v } : { x: cx + v, y: cy + u };
      line(p(-r, -r * 0.6), p(-r, r * 0.6), 2);
      line(p(r, -r * 0.6), p(r, r * 0.6), 2);
      line(p(-r, -r * 0.6), p(r, r * 0.6), 2);
      line(p(-r, r * 0.6), p(r, -r * 0.6), 2);
    },
    /** A line number or size: a row of letter-like strokes, and its box. */
    text(text: string, x: number, y: number, vertical = false, size = 12) {
      const length = text.length * size * 0.6;
      const box = vertical
        ? { x, y, width: size, height: length }
        : { x, y, width: length, height: size };
      for (let i = 0; i < text.length; i += 1) {
        const u = i * size * 0.6 + size * 0.15;
        const a = vertical ? { x: x + 2, y: y + u } : { x: x + u, y: y + 2 };
        const b = vertical
          ? { x: x + size - 2, y: y + u + size * 0.3 }
          : { x: x + u + size * 0.3, y: y + size - 2 };
        line(a, b, 1.5);
      }
      labels.push({ text, ...parseSizeLabel(text, 'in')!, ...box, vertical });
    },
    labels,
    graph(barriers: TraceBarrier[]) {
      return new TraceGraph(traceSheetFromMask(mask.slice(), width, height), barriers);
    },
  };
}

const disc = (id: string, cx: number, cy: number, r = 13): TraceBarrier => ({
  id,
  shape: { type: 'disc', cx, cy, r },
});

function read(
  s: ReturnType<typeof sheet>,
  barriers: TraceBarrier[],
  symbols: string[],
  stops: string[] = [],
): Map<string, LineSizeReading> {
  const inline = new Set(barriers.map((b) => b.id).filter((id) => !stops.includes(id)));
  return readLineSizes(s.graph(barriers), s.labels, symbols, { inline });
}

const sizeOf = (r: LineSizeReading | undefined) =>
  r?.status === 'found' ? r.size.value : (r?.status ?? 'missing');

describe('line sizes from the line numbers on a sheet (CNT-01)', () => {
  it('sizes a valve from the line number written along its pipe', () => {
    const s = sheet(600, 300);
    s.line({ x: 20, y: 150 }, { x: 580, y: 150 });
    s.text('6"-P-1001-A1', 40, 128);
    s.valve(400, 150);
    const result = read(s, [disc('v', 400, 150)], ['v']);
    expect(sizeOf(result.get('v'))).toBe(6);
    const found = result.get('v');
    expect(found?.status === 'found' && found.label.text).toBe('6"-P-1001-A1');
  });

  it('reads a label written below the pipe, and up a vertical one', () => {
    const s = sheet(400, 500);
    s.line({ x: 20, y: 100 }, { x: 380, y: 100 });
    s.text('4"-P-1003-A1', 200, 110);
    s.line({ x: 100, y: 200 }, { x: 100, y: 480 });
    s.text('3"-P-1004-A1', 80, 300, true);
    s.valve(60, 100);
    s.valve(100, 420, 'y');
    const result = read(s, [disc('a', 60, 100), disc('b', 100, 420)], ['a', 'b']);
    expect(sizeOf(result.get('a'))).toBe(4);
    expect(sizeOf(result.get('b'))).toBe(3);
  });

  it('follows the line across other valves and flanges on it, and round bends', () => {
    const s = sheet(700, 400);
    s.line({ x: 20, y: 80 }, { x: 600, y: 80 });
    s.line({ x: 600, y: 80 }, { x: 600, y: 380 });
    s.text('8"-P-1001-A1', 40, 58);
    s.valve(200, 80);
    s.line({ x: 300, y: 68 }, { x: 300, y: 92 }, 2);
    s.line({ x: 306, y: 68 }, { x: 306, y: 92 }, 2);
    s.valve(600, 300, 'y');
    const barriers = [disc('v1', 200, 80), disc('f1', 303, 80, 10), disc('v2', 600, 300)];
    const result = read(s, barriers, ['f1', 'v2']);
    expect(sizeOf(result.get('f1'))).toBe(8);
    expect(sizeOf(result.get('v2'))).toBe(8);
  });

  it('keeps to the run of a tee, and does not climb out of a branch into the run', () => {
    const s = sheet(700, 400);
    // A 6" header with a 2" branch off it; the branch label is nearer the header valve.
    s.line({ x: 20, y: 100 }, { x: 680, y: 100 });
    s.text('6"-P-1001-A1', 500, 78);
    s.line({ x: 300, y: 100 }, { x: 300, y: 380 });
    s.text('2"-P-1010-A1', 308, 200, true);
    s.valve(250, 100);
    // An instrument tap off the header with no label of its own.
    s.line({ x: 150, y: 100 }, { x: 150, y: 40 });
    const result = read(s, [disc('v', 250, 100), disc('tap', 150, 34, 8)], ['v', 'tap']);
    expect(sizeOf(result.get('v'))).toBe(6);
    expect(result.get('tap')).toEqual({ status: 'none' });
  });

  it('runs straight over a crossing line', () => {
    const s = sheet(600, 600);
    s.line({ x: 20, y: 300 }, { x: 580, y: 300 });
    s.text('4"-P-2001-A1', 40, 278);
    s.line({ x: 300, y: 20 }, { x: 300, y: 580 });
    s.text('10"-P-2002-A1', 308, 60, true);
    s.valve(450, 300);
    s.valve(300, 500, 'y');
    const result = read(s, [disc('h', 450, 300), disc('v', 300, 500)], ['h', 'v']);
    expect(sizeOf(result.get('h'))).toBe(4);
    expect(sizeOf(result.get('v'))).toBe(10);
  });

  it('jumps a break in a line where it crosses another', () => {
    const s = sheet(600, 400);
    s.line({ x: 20, y: 200 }, { x: 292, y: 200 });
    s.line({ x: 308, y: 200 }, { x: 580, y: 200 });
    s.line({ x: 300, y: 20 }, { x: 300, y: 380 });
    s.text('3"-P-3001-A1', 40, 178);
    s.valve(450, 200);
    expect(sizeOf(read(s, [disc('v', 450, 200)], ['v']).get('v'))).toBe(3);
  });

  it('leaves a valve between two sizes, beside a reducer, to the user', () => {
    const s = sheet(700, 300);
    s.line({ x: 20, y: 150 }, { x: 680, y: 150 });
    s.text('6"-P-1001-A1', 40, 128);
    s.text('4"-P-1002-A1', 520, 128);
    s.valve(350, 150);
    const result = read(s, [disc('v', 350, 150)], ['v']).get('v');
    expect(result?.status).toBe('conflict');
    // Nearest first.
    expect(result?.status === 'conflict' && result.labels.map((l) => l.size.value)).toEqual([4, 6]);
  });

  it('takes a size written beside the valve over the line number further off', () => {
    const s = sheet(700, 300);
    s.line({ x: 20, y: 150 }, { x: 680, y: 150 });
    s.text('6"-P-1001-A1', 40, 128);
    s.valve(450, 150);
    s.text('2"', 470, 128);
    expect(sizeOf(read(s, [disc('v', 450, 150)], ['v']).get('v'))).toBe(2);
  });

  it('sizes a small-bore connection only from a size written beside it', () => {
    const s = sheet(700, 300);
    s.line({ x: 20, y: 150 }, { x: 680, y: 150 });
    s.text('6"-P-1001-A1', 40, 128);
    s.line({ x: 300, y: 150 }, { x: 300, y: 60 });
    s.line({ x: 500, y: 150 }, { x: 500, y: 60 });
    s.text('3/4"', 510, 70, true);
    s.valve(300, 60, 'y');
    s.valve(500, 60, 'y');
    // On the header itself, the line number is not its size.
    s.valve(200, 150);
    const barriers = [disc('a', 300, 60), disc('b', 500, 60), disc('c', 200, 150)];
    const inline = new Set(['a', 'b', 'c']);
    const result = readLineSizes(s.graph(barriers), s.labels, ['a', 'b', 'c'], {
      inline,
      ownOnly: inline,
    });
    expect(result.get('a')).toEqual({ status: 'none' });
    expect(sizeOf(result.get('b'))).toBe(0.75);
    expect(result.get('c')).toEqual({ status: 'none' });
  });

  it('stops at vessels and other equipment', () => {
    const s = sheet(700, 300);
    s.line({ x: 20, y: 150 }, { x: 680, y: 150 });
    s.text('6"-P-1001-A1', 40, 128);
    s.valve(500, 150);
    const barriers = [disc('vessel', 300, 150, 40), disc('v', 500, 150)];
    const result = read(s, barriers, ['v'], ['vessel']);
    expect(result.get('v')).toEqual({ status: 'none' });
  });

  it('sizes a symbol ringed off centre, its circle not cutting the pipe', () => {
    const s = sheet(600, 300);
    s.line({ x: 20, y: 150 }, { x: 580, y: 150 });
    s.text('6"-P-1001-A1', 40, 128);
    s.valve(400, 150);
    // The ring sits just above the pipe, as a hand-drawn one can.
    expect(sizeOf(read(s, [disc('v', 400, 140, 8.5)], ['v']).get('v'))).toBe(6);
  });

  it('leaves every size to the user when the sheet has no labels', () => {
    const s = sheet(300, 200);
    s.line({ x: 20, y: 100 }, { x: 280, y: 100 });
    s.valve(150, 100);
    expect(read(s, [disc('v', 150, 100)], ['v']).get('v')).toEqual({ status: 'none' });
  });

  it('does not take text far from any pipe for a line number', () => {
    const s = sheet(600, 400);
    s.line({ x: 20, y: 300 }, { x: 580, y: 300 });
    s.text('6"-P-1001-A1', 40, 100);
    s.valve(300, 300);
    expect(read(s, [disc('v', 300, 300)], ['v']).get('v')).toEqual({ status: 'none' });
  });
});
