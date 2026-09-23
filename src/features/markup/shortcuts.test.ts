import { describe, expect, it } from 'vitest';
import { isTypingTarget, shortcutFor } from './shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('workspace shortcuts (ANN-08, PRJ-09)', () => {
  it('maps tool letters', () => {
    expect(shortcutFor(key('c'))).toEqual({ kind: 'tool', tool: 'circle' });
    expect(shortcutFor(key('D'))).toEqual({ kind: 'tool', tool: 'dashed' });
    expect(shortcutFor(key('v'))).toEqual({ kind: 'tool', tool: 'select' });
    expect(shortcutFor(key('x'))).toBeNull();
  });

  it('maps undo, redo and clipboard keys, with Ctrl or Cmd', () => {
    expect(shortcutFor(key('z', { ctrlKey: true }))).toEqual({ kind: 'undo' });
    expect(shortcutFor(key('z', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('y', { ctrlKey: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('c', { ctrlKey: true }))).toEqual({ kind: 'copy' });
    expect(shortcutFor(key('v', { ctrlKey: true }))).toEqual({ kind: 'paste' });
    expect(shortcutFor(key('a', { ctrlKey: true }))).toEqual({ kind: 'selectAll' });
  });

  it('maps equipment type keys before tool letters (ANN-08)', () => {
    const keys = new Map([
      ['1', 'eqt_valve'],
      ['c', 'eqt_custom'],
    ]);
    expect(shortcutFor(key('1'), keys)).toEqual({ kind: 'equipmentType', typeId: 'eqt_valve' });
    expect(shortcutFor(key('C'), keys)).toEqual({ kind: 'equipmentType', typeId: 'eqt_custom' });
    expect(shortcutFor(key('1', { ctrlKey: true }), keys)).toBeNull();
  });

  it('maps delete and escape, and ignores Alt combinations', () => {
    expect(shortcutFor(key('Delete'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(key('Backspace'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(key('Escape'))).toEqual({ kind: 'clearSelection' });
    expect(shortcutFor(key('c', { altKey: true }))).toBeNull();
    expect(shortcutFor(key('ArrowLeft', { altKey: true }))).toEqual({ kind: 'back' });
  });

  it('never fires while typing or in a dialog', () => {
    const input = document.createElement('input');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inside = document.createElement('button');
    dialog.append(inside);
    const canvas = document.createElement('div');
    canvas.setAttribute('role', 'application');
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(inside)).toBe(true);
    expect(isTypingTarget(canvas)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
