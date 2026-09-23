import { describe, expect, it } from 'vitest';
import { drawingDisplayName, paperSizeName } from './drawings';

describe('drawing helpers', () => {
  it('names ISO and ANSI paper sizes in either orientation', () => {
    expect(paperSizeName({ width: 2384, height: 1684 })).toBe('A1');
    expect(paperSizeName({ width: 842, height: 1191 })).toBe('A3');
    expect(paperSizeName({ width: 612, height: 792 })).toBe('Letter');
    expect(paperSizeName({ width: 1000, height: 1000 })).toBe('353 × 353 mm');
  });

  it('shows drawing number and sheet, falling back to the file name', () => {
    expect(drawingDisplayName({ drawingNo: 'PEFS-1', sheet: '2', fileName: 'x.pdf' })).toBe(
      'PEFS-1 / 2',
    );
    expect(drawingDisplayName({ drawingNo: '', sheet: '', fileName: 'x.pdf' })).toBe('x.pdf');
  });
});
