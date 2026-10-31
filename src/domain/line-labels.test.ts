import { describe, expect, it } from 'vitest';
import { parseSizeLabel, sizeLabels } from './line-labels';
import type { TextBox } from './text-search';

describe('size labels on drawings (CNT-01)', () => {
  it.each([
    ['6"-P-1001-A1A', 6, 'in'],
    ['8"-P-1001-A1', 8, 'in'],
    ['1-1/2"-HC-2003-B1', 1.5, 'in'],
    ['1 1/2"-HC-2003-B1', 1.5, 'in'],
    ['1½"-HC-2003-B1', 1.5, 'in'],
    ['3/4"-IA-3001', 0.75, 'in'],
    ['¾"-IA-3001', 0.75, 'in'],
    ['0.75"-IA-3001', 0.75, 'in'],
    ['6″-P-1001-A1A', 6, 'in'],
    ["6''-P-1001-A1A", 6, 'in'],
    ['6”–P–1001–A1A', 6, 'in'],
    ['6" P-1001 A1A', 6, 'in'],
    ['6 IN-P-1001-A1A', 6, 'in'],
    ['NPS 6-P-1001', 6, 'in'],
    ['DN150-P-1001-A1', 150, 'DN'],
    ['DN 150-P-1001-A1', 150, 'DN'],
    ['150NB-P-1001-A1', 150, 'DN'],
    ['6NB-P-1001-A1', 6, 'in'],
    ['P-1001-6"-A1A', 6, 'in'],
    ['HC-2003-1-1/2"-B1', 1.5, 'in'],
    ['2"-p-4100-a1', 2, 'in'],
  ])('reads the size of the line number %s', (text, value, unit) => {
    expect(parseSizeLabel(text, 'in')).toEqual({ size: { value, unit }, kind: 'lineNumber' });
  });

  it.each([
    ['3/4"', 0.75, 'in'],
    ['2"', 2, 'in'],
    [' 2 " ', 2, 'in'],
    ['DN50', 50, 'DN'],
    ['150NB', 150, 'DN'],
    ['2" DRAIN', 2, 'in'],
    ['1" VENT', 1, 'in'],
    ['6" NB', 6, 'in'],
  ])('reads the size written alone, %s', (text, value, unit) => {
    expect(parseSizeLabel(text, 'in')).toEqual({ size: { value, unit }, kind: 'size' });
  });

  it('reads a metric line number with no unit only on a DN project', () => {
    expect(parseSizeLabel('150-P-1001-A1', 'DN')).toEqual({
      size: { value: 150, unit: 'DN' },
      kind: 'lineNumber',
    });
    expect(parseSizeLabel('150-P-1001-A1', 'in')).toBeNull();
    // An equipment tag with a unit number is not a line number.
    expect(parseSizeLabel('100-P-001A', 'DN')).toBeNull();
    // 160 is not a DN size.
    expect(parseSizeLabel('160-P-1001-A1', 'DN')).toBeNull();
  });

  it.each([
    ['6"x4"', 'a reducer'],
    ['6" x 4"', 'a reducer'],
    ['6x4"', 'a reducer'],
    ['DN150 x DN100', 'a reducer'],
    ['6"-P-1001 / 4"-P-1002', 'two sizes'],
    ['HV-1001', 'a tag'],
    ['PEFS-S-001', 'a drawing number'],
    ['FROM WELLHEAD MANIFOLD', 'a note'],
    ['NOTE 3: 2" MIN. SLOPE TOWARDS THE DRAIN', 'a note'],
    ['SEE NOTE 2"', 'a note'],
    ['2" MIN SLOPE TO DRAIN POT', 'a note with many words'],
    ['6"-', 'a size and a dash'],
    ['DN160', 'a DN that is not a size'],
    ['0"', 'no size'],
    ['', 'nothing'],
  ])('leaves out %s (%s)', (text) => {
    expect(parseSizeLabel(text, 'in')).toBeNull();
  });
});

const box = (text: string, x: number, y: number, extra: Partial<TextBox> = {}): TextBox => ({
  text,
  x,
  y,
  width: text.length * 4,
  height: 7,
  ...extra,
});

describe('size labels among the text of a drawing', () => {
  it('keeps the labels with their boxes and direction', () => {
    const labels = sizeLabels(
      [
        box('8"-P-1001-A1', 80, 283),
        box('HV-101', 270, 320),
        box('4"-P-1003-A1', 530, 400, { width: 7, height: 48, vertical: true }),
      ],
      'in',
    );
    expect(labels).toEqual([
      expect.objectContaining({ text: '8"-P-1001-A1', x: 80, vertical: false }),
      expect.objectContaining({ text: '4"-P-1003-A1', y: 400, vertical: true }),
    ]);
    expect(labels[0]!.size).toEqual({ value: 8, unit: 'in' });
  });

  it('reads a label split across text runs on one line', () => {
    const labels = sizeLabels([box('6"', 100, 50), box('-G-1002-A1', 108, 50)], 'in');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ text: '6"-G-1002-A1', kind: 'lineNumber', x: 100 });
  });

  it('guesses the direction of text from its box when the drawing does not say', () => {
    const [up] = sizeLabels([box('6"-P-1001', 10, 10, { width: 7, height: 40 })], 'in');
    const [across] = sizeLabels([box('6"-P-1001', 10, 10, { width: 40, height: 7 })], 'in');
    expect(up!.vertical).toBe(true);
    expect(across!.vertical).toBe(false);
  });
});
