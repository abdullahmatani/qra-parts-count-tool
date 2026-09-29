import { describe, expect, it } from 'vitest';
import { LabelGrid, previewGeometry, type MarkerEntry } from './marker-canvas';
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
  };
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
});

describe('culling (NFR-03)', () => {
  it('keeps only markers near the visible area', () => {
    const view = { x: 100, y: 100, zoom: 1, rotation: 0 as const };
    const canvas = { width: 200, height: 200 };
    const kept = cullToView([entry('in', 100, 100), entry('out', 5000, 5000)], view, canvas, 0.75);
    expect(kept.map((e) => e.id)).toEqual(['in']);
  });
});
