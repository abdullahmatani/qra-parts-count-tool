/**
 * Reads client templates with ExcelJS for the template mapper (EXP-02): checks
 * that a file is a usable .xlsx and previews its sheets. Exports are written
 * by xlsx-writer.ts, which changes only the mapped cells. ExcelJS is loaded
 * on first use so it stays out of the initial bundle.
 */
import type { Workbook } from 'exceljs';

export async function loadExcelJs() {
  const module = await import('exceljs');
  return (module as unknown as { default?: typeof module }).default ?? module;
}

export type TemplateErrorKind = 'unreadable' | 'macro' | 'missingSheet' | 'formulaCell';

export class TemplateError extends Error {
  readonly kind: TemplateErrorKind;

  constructor(kind: TemplateErrorKind, detail = '') {
    super(detail || kind);
    this.name = 'TemplateError';
    this.kind = kind;
  }
}

/** Opens an .xlsx template; macro-enabled workbooks are refused (FDS section 7). */
export async function openTemplate(bytes: ArrayBuffer, fileName = ''): Promise<Workbook> {
  if (/\.xlsm$/i.test(fileName)) throw new TemplateError('macro');
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch (error) {
    throw new TemplateError('unreadable', error instanceof Error ? error.message : String(error));
  }
  return workbook;
}

export interface SheetPreview {
  name: string;
  /** Displayed text of the top-left cells, row by row (row 1 first). */
  rows: string[][];
}

/** The template's sheets with a preview of their top-left cells (template mapper). */
export async function previewTemplate(
  bytes: ArrayBuffer,
  fileName: string,
  size = { rows: 60, columns: 20 },
): Promise<SheetPreview[]> {
  const workbook = await openTemplate(bytes, fileName);
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    for (let r = 1; r <= size.rows; r += 1) {
      const row: string[] = [];
      for (let c = 1; c <= size.columns; c += 1) {
        const cell = sheet.getCell(r, c);
        const value = cell.value;
        row.push(
          value === null || value === undefined
            ? ''
            : typeof value === 'object' && 'formula' in value
              ? `=${value.formula}`
              : String(cell.text ?? value),
        );
      }
      rows.push(row);
    }
    return { name: sheet.name, rows };
  });
}
