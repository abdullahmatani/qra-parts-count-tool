import { describe, expect, it } from 'vitest';
import { findInText, joinLines, normaliseForSearch, type TextBox } from './text-search';

const box = (text: string, x: number, y: number, width = text.length * 5, height = 8): TextBox => ({
  text,
  x,
  y,
  width,
  height,
});

describe('text search (DRW-08)', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normaliseForSearch(' HV– 1001 ')).toBe('hv1001');
    expect(normaliseForSearch('ＨＶ－１００１')).toBe('hv1001');
    expect(normaliseForSearch('6"-P_1001')).toBe('6"p1001');
  });

  it('finds tags in reading order', () => {
    const boxes = [box('PT-101', 300, 50), box('HV-1001', 200, 100), box('HV-1002', 100, 100)];
    expect(findInText(boxes, 'hv 100').map((b) => b.text)).toEqual(['HV-1002', 'HV-1001']);
    expect(findInText(boxes, '   ')).toEqual([]);
    expect(findInText(boxes, 'XV')).toEqual([]);
  });

  it('finds a tag drawn as two runs on one line, once', () => {
    const boxes = [box('HV-', 100, 100, 15), box('1001', 116, 100, 20), box('HV-1001', 400, 300)];
    const hits = findInText(boxes, 'HV-1001');
    expect(hits.map((b) => [b.text, b.x])).toEqual([
      ['HV-1001', 100],
      ['HV-1001', 400],
    ]);
    expect(hits[0]).toMatchObject({ width: 36, height: 8 });
  });

  it('keeps runs on other lines or far apart separate', () => {
    const lines = joinLines([box('HV-', 100, 100, 15), box('1001', 116, 130), box('X', 400, 100)]);
    expect(lines.map((l) => l.text).sort()).toEqual(['1001', 'HV-', 'X']);
  });
});
