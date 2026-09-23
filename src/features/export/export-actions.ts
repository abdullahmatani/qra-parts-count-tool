/**
 * Runs exports into `exports/<timestamp>/` (FDS section 7, EXP-02, EXP-06).
 * Each run gets its own folder, so nothing is overwritten, and writes an
 * `export_log.json` saying what was exported from which project revision.
 */
import { countEntries } from '@/domain/count/count';
import {
  ITEM_FIELD_ORDER,
  itemListCsv,
  itemRows,
  planExcelExport,
  type ExcelLabels,
} from '@/domain/export/excel-plan';
import { exportableProject } from '@/domain/export/exportable';
import type { ItemField } from '@/domain/schema/types';
import i18n from '@/i18n';
import { readFile, sanitizeFileName, writeFile, writeTextAtomic } from '@/lib/fs/files';
import { isNotFound, type FsDirHandle } from '@/lib/fs/types';
import { requireWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { TemplateError, applyPlan, loadExcelJs, openTemplate } from './excel-writer';

const t = i18n.t.bind(i18n);

export const TEMPLATES_DIR = 'templates';
export const EXPORTS_DIR = 'exports';

/** `exports/2026-09-23_104512`, in local time so it matches the user's clock. */
export function exportFolderName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${EXPORTS_DIR}/${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export function excelLabels(): ExcelLabels {
  return {
    notesSheet: t('export.sheets.notes'),
    itemsSheet: t('export.sheets.items'),
    unmappedSheet: t('export.sheets.unmapped'),
    segment: t('export.columns.segment'),
    author: t('export.columns.author'),
    time: t('export.columns.time'),
    note: t('export.columns.note'),
    itemFields: Object.fromEntries(
      ITEM_FIELD_ORDER.map((field) => [field, t(`export.itemFields.${field}`)]),
    ) as Record<ItemField, string>,
    typeName: t('export.columns.type'),
    actuation: t('export.columns.actuation'),
    bin: t('export.columns.bin'),
    quantity: t('export.columns.quantity'),
    unit: t('export.columns.unit'),
    actuations: { manual: t('count.actuation.manual'), automated: t('count.actuation.automated') },
    seeNotesSheet: t('export.columns.seeNotes'),
  };
}

export interface ExportOptions {
  excel: boolean;
  csv: boolean;
}

export interface ExportResult {
  folder: string;
  files: string[];
  unmapped: number;
}

async function readTemplate(dir: FsDirHandle, fileName: string): Promise<ArrayBuffer> {
  try {
    return await (await readFile(dir, `${TEMPLATES_DIR}/${fileName}`)).arrayBuffer();
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(t('export.errors.missingTemplate', { file: fileName }), { cause: error });
    }
    throw error;
  }
}

/** Turns template problems into messages for the user. */
export function exportErrorMessage(error: unknown): string {
  if (error instanceof TemplateError) {
    return error.kind === 'missingSheet'
      ? t('export.errors.missingSheet', { sheet: error.message })
      : t(`export.errors.${error.kind}`);
  }
  return error instanceof Error ? error.message : String(error);
}

export async function runExport(options: ExportOptions, now = new Date()): Promise<ExportResult> {
  const dir = requireWorkingDirectory();
  const doc = useProjectStore.getState().doc;
  if (!doc) throw new Error('No project is open');
  const project = exportableProject(doc);
  const entries = countEntries(doc);
  const folder = exportFolderName(now);
  const base = sanitizeFileName(project.name, 'project');
  const files: string[] = [];
  let unmapped = 0;

  if (options.excel) {
    const mapping = doc.templateMapping;
    const ExcelJS = await loadExcelJs();
    const workbook = mapping
      ? await openTemplate(await readTemplate(dir, mapping.templateFile), mapping.templateFile)
      : new ExcelJS.Workbook();
    workbook.creator = 'QRA Parts Count Tool';
    const plan = planExcelExport({
      project,
      entries,
      mapping,
      templateSheets: workbook.worksheets.map((s) => s.name),
      now,
      labels: excelLabels(),
    });
    applyPlan(workbook, plan);
    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const name = `${base}_${t('export.fileSuffix')}.xlsx`;
    await writeFile(dir, `${folder}/${name}`, new Blob([buffer]));
    files.push(name);
    unmapped = plan.unmapped.length;
  }

  if (options.csv) {
    const headers = Object.fromEntries(
      ITEM_FIELD_ORDER.map((field) => [field, t(`export.itemFields.${field}`)]),
    ) as Record<ItemField, string>;
    const csv = itemListCsv(
      itemRows(project, entries, { actuations: excelLabels().actuations }),
      headers,
    );
    const name = `${base}_items.csv`;
    // A byte-order mark makes Excel read the file as UTF-8.
    await writeFile(dir, `${folder}/${name}`, new Blob([`\uFEFF${csv}`], { type: 'text/csv' }));
    files.push(name);
  }

  const log = {
    exportedAt: now.toISOString(),
    app: { name: 'qra-parts-count-tool', version: __APP_VERSION__ },
    project: { id: project.id, name: project.name, revision: project.revision },
    template: doc.templateMapping?.templateFile ?? null,
    layoutMode: doc.templateMapping?.layoutMode ?? null,
    outputs: files,
    unmappedCounts: unmapped,
  };
  await writeTextAtomic(dir, `${folder}/export_log.json`, `${JSON.stringify(log, null, 2)}\n`);
  files.push('export_log.json');
  return { folder, files, unmapped };
}
