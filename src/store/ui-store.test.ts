import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './ui-store';

const ui = () => useUiStore.getState();

describe('ui store', () => {
  beforeEach(() => ui().reset());

  it('opens drawings as tabs and activates them', () => {
    ui().openDrawing('a');
    ui().openDrawing('b');
    ui().openDrawing('a');
    expect(ui().openDrawingIds).toEqual(['a', 'b']);
    expect(ui().activeDrawingId).toBe('a');
  });

  it('activates a neighbouring tab when the active one closes', () => {
    ui().openDrawing('a');
    ui().openDrawing('b');
    ui().openDrawing('c');
    ui().openDrawing('b');
    ui().closeDrawing('b');
    expect(ui().openDrawingIds).toEqual(['a', 'c']);
    expect(ui().activeDrawingId).toBe('c');
    ui().closeDrawing('c');
    ui().closeDrawing('a');
    expect(ui().activeDrawingId).toBeNull();
  });

  it('clears the selection when switching drawings', () => {
    ui().openDrawing('a');
    ui().setSelection(['m1']);
    ui().openDrawing('b');
    expect(ui().selection).toEqual([]);
  });
});
