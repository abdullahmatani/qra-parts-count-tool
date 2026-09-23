// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { ExcelPlan } from '@/domain/export/excel-plan';
import {
  TemplateError,
  applyPlan,
  buildWorkbook,
  openTemplate,
  previewTemplate,
} from './excel-writer';

/** A small client-style template: a styled master sheet with a formula and a merge. */
async function template(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const master = wb.addWorksheet('Master');
  master.getCell('A1').value = 'Segment';
  master.mergeCells('B1:C1');
  master.getCell('B1').font = { bold: true, color: { argb: 'FF1F4E79' } };
  master.getCell('D14').numFmt = '0';
  master.getCell('D14').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  master.getCell('F14').value = { formula: 'D14*2' };
  master.getColumn(1).width = 22;
  const other = wb.addWorksheet('Frequencies');
  other.getCell('A1').value = 'Leak frequency data';
  wb.definedNames.add('Frequencies!$A$1', 'DatasetTitle');
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const plan: ExcelPlan = {
  copies: [
    { source: 'Master', name: 'IS-01' },
    { source: 'Master', name: 'IS-02' },
  ],
  removeSheets: ['Master'],
  writes: [
    { sheet: 'IS-01', address: 'B1', value: 'IS-01' },
    { sheet: 'IS-01', address: 'D14', value: 7 },
    { sheet: 'IS-02', address: 'B1', value: 'IS-02' },
    { sheet: 'IS-02', address: 'D14', value: 0 },
  ],
  extraSheets: [
    {
      name: 'Notes',
      columns: [
        { header: 'Segment', width: 14 },
        { header: 'Note', width: 90 },
      ],
      rows: [['IS-01', 'Line 1\nLine 2']],
    },
  ],
  unmapped: [],
  warnings: [],
};

describe('Excel writer (EXP-02)', () => {
  it('fills copies of the master sheet and keeps formatting, formulas and other sheets', async () => {
    const out = await buildWorkbook({ bytes: await template(), fileName: 'client.xlsx' }, plan);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Frequencies', 'IS-01', 'IS-02', 'Notes']);
    const is01 = wb.getWorksheet('IS-01')!;
    expect(is01.getCell('A1').value).toBe('Segment');
    expect(is01.getCell('B1').value).toBe('IS-01');
    expect(is01.getCell('B1').font?.bold).toBe(true);
    expect(is01.getCell('B1').isMerged).toBe(true);
    expect(is01.getCell('D14').value).toBe(7);
    expect(is01.getCell('D14').fill).toMatchObject({ fgColor: { argb: 'FFFFF2CC' } });
    expect(is01.getCell('F14').value).toMatchObject({ formula: 'D14*2' });
    expect(is01.getColumn(1).width).toBe(22);
    expect(wb.getWorksheet('IS-02')!.getCell('D14').value).toBe(0);
    expect(wb.getWorksheet('Frequencies')!.getCell('A1').value).toBe('Leak frequency data');
    expect(wb.definedNames.getNames('Frequencies!$A$1')).toContain('DatasetTitle');
    const notes = wb.getWorksheet('Notes')!;
    expect(notes.getCell('A1').value).toBe('Segment');
    expect(notes.getCell('B2').value).toBe('Line 1\nLine 2');
  });

  it('copies styles into later blocks', async () => {
    const wb = await openTemplate(await template());
    applyPlan(wb, {
      ...plan,
      copies: [],
      removeSheets: [],
      extraSheets: [],
      writes: [{ sheet: 'Master', address: 'D39', value: 3, styleFrom: 'D14' }],
    });
    expect(wb.getWorksheet('Master')!.getCell('D39').fill).toMatchObject({
      fgColor: { argb: 'FFFFF2CC' },
    });
  });

  it('writes a new workbook when there is no template', async () => {
    const out = await buildWorkbook(null, { ...plan, copies: [], removeSheets: [], writes: [] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Notes']);
  });

  it('refuses macro-enabled and unreadable templates, and missing sheets', async () => {
    await expect(openTemplate(await template(), 'client.xlsm')).rejects.toMatchObject({
      kind: 'macro',
    });
    await expect(openTemplate(new TextEncoder().encode('not excel').buffer)).rejects.toBeInstanceOf(
      TemplateError,
    );
    const wb = await openTemplate(await template());
    expect(() => applyPlan(wb, { ...plan, copies: [{ source: 'Nope', name: 'X' }] })).toThrow(
      TemplateError,
    );
  });

  it('previews the sheets for the template mapper', async () => {
    const sheets = await previewTemplate(await template(), 'client.xlsx', { rows: 14, columns: 6 });
    expect(sheets.map((s) => s.name)).toEqual(['Master', 'Frequencies']);
    expect(sheets[0]!.rows[0]![0]).toBe('Segment');
    expect(sheets[0]!.rows[13]![5]).toBe('=D14*2');
  });
});
