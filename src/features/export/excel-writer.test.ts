// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { TemplateError, openTemplate, previewTemplate } from './excel-writer';

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

describe('Excel template reader (EXP-02)', () => {
  it('refuses macro-enabled and unreadable templates', async () => {
    await expect(openTemplate(await template(), 'client.xlsm')).rejects.toMatchObject({
      kind: 'macro',
    });
    await expect(openTemplate(new TextEncoder().encode('not excel').buffer)).rejects.toBeInstanceOf(
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
