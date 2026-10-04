import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './ui-store';

const ui = () => useUiStore.getState();

describe('ui store', () => {
  beforeEach(() => ui().reset());

  it('keeps the app state (offline readiness, a waiting update) when a project closes', () => {
    const update = () => {};
    ui().setOfflineReady(true);
    ui().setAppUpdate(update);
    ui().openDrawing('a');
    ui().reset();
    expect(ui().offlineReady).toBe(true);
    expect(ui().appUpdate).toBe(update);
    expect(ui().openDrawingIds).toEqual([]);
    ui().setOfflineReady(false);
    ui().setAppUpdate(null);
  });

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
