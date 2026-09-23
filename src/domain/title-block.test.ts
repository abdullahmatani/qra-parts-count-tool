import { describe, expect, it } from 'vitest';
import { drawingNoFromFileName, guessTitleBlock, mergeRuns, type TextItem } from './title-block';

const A1 = { width: 2384, height: 1684 };
/** Builds an item from PDF-style coordinates (y up), as in the e2e fixtures. */
const at = (
  text: string,
  x: number,
  yUp: number,
  size: number,
  width = text.length * size * 0.55,
): TextItem => ({
  text,
  x,
  y: A1.height - yUp,
  size,
  width,
});

const fixtureTitleBlock: TextItem[] = [
  at('TITLE', 1772, 145, 9),
  at('INLET SEPARATOR V-100', 1772, 128, 14),
  at('DRAWING NO.', 1772, 102, 9),
  at('PEFS-1001', 1772, 75, 22),
  at('SHEET', 1772, 50, 9),
  at('1 OF 1', 1824, 42, 12),
  at('REV', 2194, 102, 9),
  at('C', 2234, 70, 26),
];

const noise: TextItem[] = [
  at('PEFS-1002', 2208, 1546, 8), // off-page connector
  at('HV-1034', 900, 800, 6.5),
  at('6"-P-1003-A1', 300, 700, 7),
  at('PT-104', 1200, 900, 7),
];

describe('title block extraction (DRW-04)', () => {
  it('reads drawing number, title, revision and sheet from labelled fields', () => {
    expect(guessTitleBlock([...noise, ...fixtureTitleBlock], A1)).toEqual({
      drawingNo: 'PEFS-1001',
      title: 'INLET SEPARATOR V-100',
      revision: 'C',
      sheet: '1',
    });
  });

  it('falls back to the largest drawing number in the title-block region', () => {
    const items = [...noise, at('ABC-123-P-0001', 1900, 60, 20), at('XY-1', 1900, 120, 8)];
    expect(guessTitleBlock(items, A1).drawingNo).toBe('ABC-123-P-0001');
  });

  it('falls back to the file name when there is no text', () => {
    expect(guessTitleBlock([], A1, 'PEFS-1001_A1.pdf').drawingNo).toBe('PEFS-1001');
    expect(drawingNoFromFileName('scan 0042.pdf')).toBe('');
    expect(drawingNoFromFileName('P&ID 12-345-678 rev B.pdf')).toBe('12-345-678');
  });

  it('accepts common label spellings', () => {
    const items = [
      at('DWG No:', 1800, 100, 8),
      at('12-PID-0042', 1800, 80, 14),
      at('Revision', 2100, 100, 8),
      at('03', 2100, 80, 14),
      at('Sheet No.', 2200, 100, 8),
      at('2/5', 2200, 80, 12),
    ];
    expect(guessTitleBlock(items, A1)).toMatchObject({
      drawingNo: '12-PID-0042',
      revision: '03',
      sheet: '2',
    });
  });

  it('merges adjacent text runs on one baseline', () => {
    const runs = [
      { text: 'PEFS', x: 100, y: 50, width: 40, size: 10 },
      { text: '-1001', x: 140.5, y: 50, width: 30, size: 10 },
      { text: 'far', x: 400, y: 50, width: 20, size: 10 },
    ];
    expect(mergeRuns(runs).map((r) => r.text)).toEqual(['PEFS-1001', 'far']);
  });
});
