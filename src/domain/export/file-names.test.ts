import { describe, expect, it } from 'vitest';
import { formatExportName, uniqueName } from './file-names';

describe('export file names (EXP-05)', () => {
  it('fills the pattern tokens', () => {
    expect(
      formatExportName('{drawingNo}_{rev}_annotated', { drawingNo: 'PEFS-001', rev: 'C' }),
    ).toBe('PEFS-001_C_annotated');
    expect(
      formatExportName('{project}_{segment}_{drawingNo}_{rev}', {
        project: 'Plant A',
        segment: 'IS-01',
        drawingNo: 'PEFS-001',
        rev: '2',
      }),
    ).toBe('Plant A_IS-01_PEFS-001_2');
  });

  it('drops separators left by empty values and keeps unknown tokens', () => {
    expect(formatExportName('{drawingNo}_{rev}_annotated', { drawingNo: 'PEFS-001' })).toBe(
      'PEFS-001_annotated',
    );
    expect(formatExportName('{drawingNo}_{unknown}', { drawingNo: 'X' })).toBe('X_{unknown}');
  });

  it('makes names safe on every file system', () => {
    expect(formatExportName('{drawingNo}', { drawingNo: 'A/B:C*?' })).toBe('A_B_C');
    expect(formatExportName('{drawingNo}', { drawingNo: 'CON' })).toBe('CON_');
    expect(formatExportName('{drawingNo}', {})).toBe('drawing');
  });

  it('keeps names unique within a folder', () => {
    const taken = new Set<string>();
    expect(uniqueName('PEFS-001_annotated', '.pdf', taken)).toBe('PEFS-001_annotated.pdf');
    expect(uniqueName('PEFS-001_annotated', '.pdf', taken)).toBe('PEFS-001_annotated (2).pdf');
  });
});
