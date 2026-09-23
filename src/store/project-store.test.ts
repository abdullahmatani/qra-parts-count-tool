import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectToDoc } from '@/domain/model';
import { makePopulatedProject } from '@/test/fixtures';
import { COALESCE_WINDOW_MS, HISTORY_LIMIT, historyClock, useProjectStore } from './project-store';

const store = () => useProjectStore.getState();
let now = 1_000_000;

describe('project store undo/redo (PRJ-09)', () => {
  beforeEach(() => {
    now = 1_000_000;
    historyClock.now = () => now;
    store().load(projectToDoc(makePopulatedProject()));
  });
  afterEach(() => {
    historyClock.now = () => Date.now();
    store().close();
  });

  it('records an undo step for each edit and restores state exactly', () => {
    const before = store().doc;
    store().apply('Rename project', (d) => {
      d.name = 'Renamed';
    });
    expect(store().doc?.name).toBe('Renamed');
    expect(store().past).toHaveLength(1);

    expect(store().undo()).toBe('Rename project');
    expect(store().doc).toEqual(before);
    expect(store().redo()).toBe('Rename project');
    expect(store().doc?.name).toBe('Renamed');
  });

  it('undoes deletion of an entity from a keyed collection with a small patch', () => {
    const markerId = Object.keys(store().doc!.markers)[0]!;
    store().apply('Delete marker', (d) => {
      delete d.markers[markerId];
    });
    expect(store().past[0]!.patches).toHaveLength(1);
    expect(store().doc!.markers[markerId]).toBeUndefined();
    store().undo();
    expect(store().doc!.markers[markerId]).toBeDefined();
  });

  it('ignores no-op edits', () => {
    const changed = store().apply('Nothing', () => {});
    expect(changed).toBe(false);
    expect(store().past).toHaveLength(0);
  });

  it('clears the redo stack on a new edit', () => {
    store().apply('A', (d) => void (d.client = 'A'));
    store().undo();
    expect(store().future).toHaveLength(1);
    store().apply('B', (d) => void (d.client = 'B'));
    expect(store().future).toHaveLength(0);
  });

  it('keeps at least 100 steps (PRJ-09)', () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      store().apply(`Edit ${i}`, (d) => void (d.description = `v${i}`));
    }
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(100);
    expect(store().past).toHaveLength(HISTORY_LIMIT);
    let steps = 0;
    while (store().undo()) steps += 1;
    expect(steps).toBe(HISTORY_LIMIT);
    expect(store().doc?.description).toBe(`v${19}`);
  });

  it('coalesces rapid edits with the same key into one step', () => {
    store().apply('Type name', (d) => void (d.name = 'A'), { coalesceKey: 'name' });
    now += 100;
    store().apply('Type name', (d) => void (d.name = 'AB'), { coalesceKey: 'name' });
    now += 100;
    store().apply('Type name', (d) => void (d.name = 'ABC'), { coalesceKey: 'name' });
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().doc?.name).toBe('Test project');
    store().redo();
    expect(store().doc?.name).toBe('ABC');
  });

  it('starts a new step when the coalesce window has passed', () => {
    store().apply('Type', (d) => void (d.name = 'A'), { coalesceKey: 'name' });
    now += COALESCE_WINDOW_MS + 1;
    store().apply('Type', (d) => void (d.name = 'AB'), { coalesceKey: 'name' });
    expect(store().past).toHaveLength(2);
  });

  it('refuses edits, undo and redo in read-only mode (PRJ-07)', () => {
    store().apply('A', (d) => void (d.client = 'A'));
    store().setReadOnly(true);
    expect(store().apply('B', (d) => void (d.client = 'B'))).toBe(false);
    expect(store().undo()).toBeNull();
    expect(store().doc?.client).toBe('A');
  });

  it('counts every change for autosave, including undo and redo', () => {
    const start = store().changeCounter;
    store().apply('A', (d) => void (d.client = 'A'));
    store().undo();
    store().redo();
    expect(store().changeCounter).toBe(start + 3);
  });

  it('records save metadata without an undo step or change count', () => {
    const counter = store().changeCounter;
    store().markSaved({ revision: 7, updatedAt: '2026-09-23T12:00:00.000Z' });
    expect(store().doc?.revision).toBe(7);
    expect(store().changeCounter).toBe(counter);
    expect(store().past).toHaveLength(0);
  });

  it('applies housekeeping without history when asked', () => {
    store().apply('Housekeeping', (d) => void (d.client = 'X'), { skipHistory: true });
    expect(store().past).toHaveLength(0);
    expect(store().doc?.client).toBe('X');
  });
});
