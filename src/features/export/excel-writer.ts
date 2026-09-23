/**
 * Applies an Excel export plan to the client's template with ExcelJS (EXP-02).
 * Only mapped cells are written: formatting, formulas, named ranges and other
 * sheets are kept, and the template file itself is never changed. ExcelJS is
 * loaded on first use so it stays out of the initial bundle.
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { CellValue, ExcelPlan } from '@/domain/export/excel-plan';

export async function loadExcelJs() {
  const module = await import('exceljs');
  return (module as unknown as { default?: typeof module }).default ?? module;
}

export type TemplateErrorKind = 'unreadable' | 'macro' | 'missingSheet';

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

/** A copy of a worksheet with its cells, styles, merges, widths and page setup. */
function copySheet(workbook: Workbook, source: Worksheet, name: string): Worksheet {
  const copy = workbook.addWorksheet(name);
  const model = source.model as unknown as Record<string, unknown>;
  (copy as unknown as { model: unknown }).model = {
    ...model,
    name,
    id: copy.id,
    // The model getter calls merges `merges`, the setter reads `mergeCells`.
    mergeCells: model.merges,
    // Excel table names must be unique in a workbook, so tables are not copied.
    tables: [],
  };
  return copy;
}

function sheetOrThrow(workbook: Workbook, name: string): Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new TemplateError('missingSheet', name);
  return sheet;
}

function setValue(sheet: Worksheet, address: string, value: CellValue): void {
  sheet.getCell(address).value = value;
}

/** Applies the plan to an open workbook. */
export function applyPlan(workbook: Workbook, plan: ExcelPlan): void {
  for (const copy of plan.copies) {
    copySheet(workbook, sheetOrThrow(workbook, copy.source), copy.name);
  }
  for (const write of plan.writes) {
    const sheet = sheetOrThrow(workbook, write.sheet);
    if (write.styleFrom) {
      const style = sheet.getCell(write.styleFrom).style;
      sheet.getCell(write.address).style = JSON.parse(JSON.stringify(style ?? {}));
    }
    setValue(sheet, write.address, write.value);
  }
  for (const name of plan.removeSheets) {
    const sheet = workbook.getWorksheet(name);
    if (sheet) workbook.removeWorksheet(sheet.id);
  }
  for (const extra of plan.extraSheets) {
    const sheet = workbook.addWorksheet(extra.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = extra.columns.map((c) => ({ header: c.header, width: c.width }));
    sheet.getRow(1).font = { bold: true };
    for (const row of extra.rows) sheet.addRow(row);
    for (const column of sheet.columns) {
      if ((column.width ?? 0) >= 40) column.alignment = { wrapText: true, vertical: 'top' };
    }
  }
}

/** Builds the output workbook: the template filled per the plan, or a new workbook. */
export async function buildWorkbook(
  template: { bytes: ArrayBuffer; fileName: string } | null,
  plan: ExcelPlan,
): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const workbook = template
    ? await openTemplate(template.bytes, template.fileName)
    : new ExcelJS.Workbook();
  workbook.creator = 'QRA Parts Count Tool';
  applyPlan(workbook, plan);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
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
