import { describe, expect, it } from 'vitest';
import { HIGHLIGHTER_ALPHA, SETUP_DIMMED_ALPHA } from '@/domain/palette';
import { LabelGrid, drawMarkers, previewGeometry, type MarkerEntry } from './marker-canvas';
import { cullToView } from './marker-renderer';

function entry(id: string, cx: number, cy: number): MarkerEntry {
  return {
    id,
    geometry: { type: 'circle', cx, cy, r: 5 },
    colour: '#000000',
    dash: [],
    label: '',
    selected: false,
    highlighted: false,
    warning: false,
    esdv: false,
    endFlange: false,
    symbol: 'circle',
    outline: null,
    segmentId: null,
    dimmed: false,
  };
}

/** A 2D context that records the colour and opacity of each fill and stroke. */
function recordingContext() {
  const calls: { op: 'fill' | 'stroke'; style: string; alpha: number }[] = [];
  const state: Record<string | symbol, unknown> = {
    globalAlpha: 1,
    canvas: { width: 100, height: 100 },
    fill() {
      calls.push({ op: 'fill', style: String(state.fillStyle), alpha: Number(state.globalAlpha) });
    },
    stroke() {
      calls.push({
        op: 'stroke',
        style: String(state.strokeStyle),
        alpha: Number(state.globalAlpha),
      });
    },
  };
  const ctx = new Proxy(state, {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('label decluttering', () => {
  it('places boxes that do not overlap and refuses ones that do', () => {
    const grid = new LabelGrid();
    expect(grid.place(0, 0, 50, 13)).toBe(true);
    expect(grid.place(40, 5, 90, 18)).toBe(false);
    expect(grid.place(51, 0, 100, 13)).toBe(true);
    // Across grid cells.
    expect(grid.place(60, 60, 200, 73)).toBe(true);
    expect(grid.place(190, 70, 220, 80)).toBe(false);
  });
});

describe('dimmed set-up (counting)', () => {
  it('draws the set-up faint and first, and the equipment over it at full strength', () => {
    const { ctx, calls } = recordingContext();
    const stroke: MarkerEntry = {
      ...entry('hl', 0, 0),
      geometry: {
        type: 'stroke',
        points: [
          [0, 0],
          [50, 0],
        ],
        width: 6,
      },
      colour: '#111111',
      dimmed: true,
    };
    const esdv: MarkerEntry = {
      ...entry('esdv', 20, 0),
      colour: '#dc2626',
      esdv: true,
      dimmed: true,
    };
    const valve: MarkerEntry = { ...entry('valve', 40, 0), colour: '#2563eb' };
    drawMarkers(ctx, [stroke, valve, esdv], {
      matrix: [1, 0, 0, 1, 0, 0],
      devicePixelRatio: 1,
      unitsPerPixel: 1,
      canvasSize: { width: 100, height: 100 },
      preview: null,
      hoveredId: null,
      showLabels: false,
    });
    const of = (colour: string) => calls.filter((c) => c.style === colour && c.op === 'stroke');
    expect(of('#111111').map((c) => c.alpha)).toEqual([HIGHLIGHTER_ALPHA * SETUP_DIMMED_ALPHA]);
    expect(of('#dc2626').map((c) => c.alpha)).toEqual([SETUP_DIMMED_ALPHA]);
    expect(of('#2563eb').map((c) => c.alpha)).toEqual([1]);
    // The ESDV, though a ring like the valve, is painted before it.
    expect(calls.indexOf(of('#dc2626')[0]!)).toBeLessThan(calls.indexOf(of('#2563eb')[0]!));
  });
});

describe('preview geometry', () => {
  it('moves dragged markers and replaces a resized one', () => {
    const a = entry('a', 10, 10);
    const b = entry('b', 20, 20);
    const move = { kind: 'move' as const, ids: new Set(['a']), dx: 5, dy: 0 };
    expect(previewGeometry(a, move)).toMatchObject({ cx: 15 });
    expect(previewGeometry(b, move)).toBe(b.geometry);
    const geometry = { type: 'circle' as const, cx: 0, cy: 0, r: 1 };
    expect(previewGeometry(b, { kind: 'resize', id: 'b', geometry })).toBe(geometry);
  });

  it('draws a stroke the eraser went over as what is left of it', () => {
    const stroke = (id: string, from: number, to: number): MarkerEntry => ({
      ...entry(id, 0, 0),
      geometry: {
        type: 'stroke',
        points: [
          [from, 0],
          [to, 0],
        ],
        width: 10,
      },
    });
    const starts: number[] = [];
    const { ctx } = recordingContext();
    (ctx as unknown as { moveTo: (x: number) => void }).moveTo = (x) => starts.push(x);
    const cut = stroke('cut', 0, 400);
    drawMarkers(ctx, [cut, stroke('gone', 0, 50), stroke('kept', 500, 600)], {
      matrix: [1, 0, 0, 1, 0, 0],
      devicePixelRatio: 1,
      unitsPerPixel: 1,
      canvasSize: { width: 100, height: 100 },
      preview: {
        kind: 'erase',
        left: new Map([
          ['cut', [stroke('a', 0, 185).geometry, stroke('b', 215, 400).geometry]],
          ['gone', []],
        ]),
      },
      hoveredId: null,
      showLabels: false,
    });
    // Two pieces of the cut stroke and the stroke it did not touch; none of the one rubbed out.
    expect(starts).toEqual([0, 215, 500]);
  });
});

describe('culling (NFR-03)', () => {
  it('keeps only markers near the visible area', () => {
    const view = { x: 100, y: 100, zoom: 1, rotation: 0 as const };
    const canvas = { width: 200, height: 200 };
    const kept = cullToView([entry('in', 100, 100), entry('out', 5000, 5000)], view, canvas, 0.75);
    expect(kept.map((e) => e.id)).toEqual(['in']);
  });
});
