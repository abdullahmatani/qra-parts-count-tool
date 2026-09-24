/**
 * Runs exports into `exports/<timestamp>/` (FDS section 7, EXP-02, EXP-06).
 * Each run gets its own folder, so nothing is overwritten, and writes an
 * `export_log.json` saying what was exported from which project revision.
 */
import { countEntries, type CountEntry } from '@/domain/count/count';
import {
  ITEM_FIELD_ORDER,
  itemListCsv,
  itemRows,
  planExcelExport,
  type ExcelLabels,
} from '@/domain/export/excel-plan';
import { exportableProject } from '@/domain/export/exportable';
import { drawingName, planPdfExport, type PdfLabels } from '@/domain/export/pdf-plan';
import type { CheckKind } from '@/domain/export/pre-export-check';
import { unconvertedValues } from '@/domain/export/process-units';
import type { ProjectDoc } from '@/domain/model';
import type { Drawing, ItemField } from '@/domain/schema/types';
import type { DisplayList } from '@/features/cad/display-list';
import i18n, { tFile } from '@/i18n';
import { readFile, sanitizeFileName, writeFile, writeTextAtomic } from '@/lib/fs/files';
import { isNotFound, type FsDirHandle } from '@/lib/fs/types';
import { requireWorkingDirectory } from '@/services/session';
import { usePreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { TemplateError } from './excel-writer';
import { templateSheetNames, writeWorkbook } from './xlsx-writer';
import { PdfSourceError, type BuildPage, type PageSource } from './pdf-export-protocol';
import { PdfExportClient } from './pdf-export-client';

const t = i18n.t.bind(i18n);

export const TEMPLATES_DIR = 'templates';
export const EXPORTS_DIR = 'exports';

/** `exports/2026-09-23_104512`, in local time so it matches the user's clock. */
export function exportFolderName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${EXPORTS_DIR}/${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** Labels written into the workbook and CSV: always English (NFR-08). */
export function excelLabels(): ExcelLabels {
  return {
    notesSheet: tFile('export.sheets.notes'),
    itemsSheet: tFile('export.sheets.items'),
    unmappedSheet: tFile('export.sheets.unmapped'),
    segment: tFile('export.columns.segment'),
    author: tFile('export.columns.author'),
    time: tFile('export.columns.time'),
    note: tFile('export.columns.note'),
    itemFields: Object.fromEntries(
      ITEM_FIELD_ORDER.map((field) => [field, tFile(`export.itemFields.${field}`)]),
    ) as Record<ItemField, string>,
    typeName: tFile('export.columns.type'),
    actuation: tFile('export.columns.actuation'),
    bin: tFile('export.columns.bin'),
    quantity: tFile('export.columns.quantity'),
    unit: tFile('export.columns.unit'),
    actuations: {
      manual: tFile('count.actuation.manual'),
      automated: tFile('count.actuation.automated'),
    },
    seeNotesSheet: tFile('export.columns.seeNotes'),
  };
}

/** Labels drawn on the annotated PDFs: always English (NFR-08). */
export function pdfLabels(): PdfLabels {
  return {
    legendTitle: tFile('export.pdf.legend'),
    esdv: tFile('export.pdf.esdv'),
    unassigned: tFile('export.pdf.unassigned'),
    warning: tFile('export.pdf.warning'),
    drawing: (drawing) => {
      const name = [
        drawingName(drawing),
        drawing.revision && tFile('export.pdf.rev', { rev: drawing.revision }),
      ]
        .filter(Boolean)
        .join(' ');
      return drawing.sheet
        ? `${name}, ${tFile('export.pdf.sheet', { sheet: drawing.sheet })}`
        : name;
    },
    segment: (label) => tFile('export.pdf.segment', { label }),
    countRevision: (revision) => tFile('export.pdf.countRevision', { revision }),
    exported: (date) => tFile('export.pdf.exported', { date }),
  };
}

/**
 * Counts that have no cell in the mapped template, for the pre-export check
 * (section 7). Null when no template is mapped: then nothing can be unmapped.
 */
export function unmappedCountNames(
  doc: ProjectDoc,
  entries: readonly CountEntry[],
): string[] | null {
  if (!doc.templateMapping) return null;
  const labels = excelLabels();
  const plan = planExcelExport({
    project: exportableProject(doc),
    entries,
    mapping: doc.templateMapping,
    templateSheets: [],
    now: new Date(),
    labels,
  });
  return plan.unmapped.map((u) => {
    const type = u.actuation ? `${u.typeName}, ${labels.actuations[u.actuation]}` : u.typeName;
    return `${u.segmentLabel}: ${type} ${u.binLabel}`;
  });
}

/** Segment values the mapped template needs in units they cannot be given in (EXP-01). */
export function unconvertedValueNames(doc: ProjectDoc): string[] | null {
  const fields = doc.templateMapping?.headerFields;
  if (!fields || doc.templateMapping?.layoutMode === 'flatItemList') return null;
  return unconvertedValues(
    doc.segmentOrder.map((id) => doc.segments[id]!).filter(Boolean),
    doc.settings.units,
    {
      phaseLiquidGas: !!fields.phaseLiquidGas,
      pressureBara: !!fields.pressureBara,
      temperatureC: !!fields.temperatureC,
    },
  );
}

/** Commits the annotated PDF file name pattern (EXP-05) as one undo step. */
export function setFilenamePatternCommand(pattern: string): boolean {
  return useProjectStore.getState().apply(t('export.patternHistory'), (draft) => {
    draft.settings.exportFilenamePattern = pattern.trim();
  });
}

/** A pre-export check the user chose to export past (EXP-01), for the log. */
export interface AcceptedWarning {
  kind: CheckKind;
  count: number;
  names: string[];
}

export interface ExportOptions {
  excel: boolean;
  csv: boolean;
  /** One annotated PDF per drawing (EXP-03). */
  drawingPdfs?: boolean;
  /** One combined PDF per segment (EXP-03). */
  segmentPdfs?: boolean;
  accepted?: AcceptedWarning[];
  onProgress?: (progress: { done: number; total: number }) => void;
}

export interface ExportFailure {
  file: string;
  message: string;
}

export interface ExportResult {
  folder: string;
  files: string[];
  unmapped: number;
  failures: ExportFailure[];
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
    if (error.kind === 'missingSheet')
      return t('export.errors.missingSheet', { sheet: error.message });
    if (error.kind === 'formulaCell')
      return t('export.errors.formulaCell', { cell: error.message });
    return t(`export.errors.${error.kind}`);
  }
  return error instanceof Error ? error.message : String(error);
}

function pdfSourceKey(drawing: Drawing): string {
  return `${drawing.fileName}#${drawing.fileHash}`;
}

/** Reads drawings for the PDF export, keeping a few CAD display lists for segment PDFs. */
class PageSources {
  private readonly lists = new Map<string, DisplayList>();
  private readonly files = new Map<string, Drawing>();
  private readonly dir: FsDirHandle;
  private readonly doc: ProjectDoc;

  constructor(dir: FsDirHandle, doc: ProjectDoc) {
    this.dir = dir;
    this.doc = doc;
  }

  async page(drawingId: string): Promise<PageSource> {
    const drawing = this.doc.drawings[drawingId]!;
    if (drawing.fileType === 'pdf') {
      const key = pdfSourceKey(drawing);
      this.files.set(key, drawing);
      return { kind: 'pdf', key, pageIndex: (drawing.page ?? 1) - 1 };
    }
    const mode = usePreferences.getState().cadColorMode;
    let list = this.lists.get(drawing.id);
    if (!list) {
      const { loadCadDisplayList } = await import('@/features/cad/cad-drawings');
      try {
        list = await loadCadDisplayList(this.dir, drawing);
      } catch (error) {
        throw this.fileError(drawing, error, () =>
          t('export.pdf.errors.cad', {
            drawing: drawingName(drawing),
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      this.lists.set(drawing.id, list);
      if (this.lists.size > 4) this.lists.delete(this.lists.keys().next().value!);
    }
    return { kind: 'cad', list, mode };
  }

  async bytes(key: string): Promise<ArrayBuffer> {
    const drawing = this.files.get(key)!;
    try {
      return await (await readFile(this.dir, `drawings/${drawing.fileName}`)).arrayBuffer();
    } catch (error) {
      throw this.fileError(drawing, error);
    }
  }

  drawingFor(key: string): Drawing | undefined {
    return this.files.get(key);
  }

  private fileError(drawing: Drawing, error: unknown, other?: () => string): Error {
    if (isNotFound(error)) {
      const message = t('export.pdf.errors.missingFile', {
        drawing: drawingName(drawing),
        file: drawing.fileName,
      });
      return new Error(message, { cause: error });
    }
    return new Error(other ? other() : String(error), { cause: error });
  }
}

function pdfFailureMessage(error: unknown, pages: BuildPage[], sources: PageSources): string {
  if (error instanceof PdfSourceError) {
    // The worker names no drawing; the plan's PDF pages tell which one it was.
    const drawing = pages
      .map((p) => (p.source.kind === 'pdf' ? sources.drawingFor(p.source.key) : undefined))
      .find((d) => d !== undefined);
    const name = drawing ? drawingName(drawing) : '';
    return t(`export.pdf.errors.${error.problem}`, { drawing: name, page: drawing?.page ?? 1 });
  }
  return error instanceof Error ? error.message : String(error);
}

async function exportPdfs(
  dir: FsDirHandle,
  doc: ProjectDoc,
  folder: string,
  options: ExportOptions,
  context: { now: Date; taken: Set<string>; files: string[]; failures: ExportFailure[] },
): Promise<{ drawings: number; segments: number }> {
  const plans = planPdfExport({
    doc,
    entries: countEntries(doc),
    drawings: options.drawingPdfs === true,
    segments: options.segmentPdfs === true,
    now: context.now,
    labels: pdfLabels(),
    taken: context.taken,
  });
  const sources = new PageSources(dir, doc);
  const client = new PdfExportClient();
  let drawings = 0;
  let segments = 0;
  try {
    for (const [i, plan] of plans.entries()) {
      const pages: BuildPage[] = [];
      try {
        for (const page of plan.pages) {
          pages.push({ source: await sources.page(page.drawingId), overlay: page.overlay });
        }
        const bytes = await client.build(
          { title: plan.title, createdAt: context.now.toISOString(), pages },
          (key) => sources.bytes(key),
        );
        await writeFile(
          dir,
          `${folder}/${plan.fileName}`,
          new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
        );
        context.files.push(plan.fileName);
        if (plan.kind === 'drawing') drawings += 1;
        else segments += 1;
      } catch (error) {
        context.failures.push({
          file: plan.fileName,
          message: pdfFailureMessage(error, pages, sources),
        });
      }
      options.onProgress?.({ done: i + 1, total: plans.length });
    }
  } finally {
    client.dispose();
  }
  return { drawings, segments };
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
  const failures: ExportFailure[] = [];
  let unmapped = 0;

  if (options.excel) {
    const mapping = doc.templateMapping;
    const template = mapping
      ? { bytes: await readTemplate(dir, mapping.templateFile), fileName: mapping.templateFile }
      : null;
    const plan = planExcelExport({
      project,
      entries,
      mapping,
      templateSheets: template ? await templateSheetNames(template) : [],
      now,
      labels: excelLabels(),
    });
    // Only the mapped cells change; the rest of the template is kept as it is.
    const buffer = await writeWorkbook(template, plan);
    const name = `${base}_${tFile('export.fileSuffix')}.xlsx`;
    await writeFile(dir, `${folder}/${name}`, new Blob([buffer]));
    files.push(name);
    unmapped = plan.unmapped.length;
  }

  if (options.csv) {
    const headers = Object.fromEntries(
      ITEM_FIELD_ORDER.map((field) => [field, tFile(`export.itemFields.${field}`)]),
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

  let pdf: { drawings: number; segments: number } | null = null;
  if (options.drawingPdfs || options.segmentPdfs) {
    const taken = new Set([...files, 'export_log.json'].map((f) => f.toLowerCase()));
    pdf = await exportPdfs(dir, doc, folder, options, { now, taken, files, failures });
  }

  const log = {
    exportedAt: now.toISOString(),
    app: { name: 'qra-parts-count-tool', version: __APP_VERSION__ },
    project: {
      id: project.id,
      name: project.name,
      revision: project.revision,
      countRevision: project.countRevision,
    },
    template: doc.templateMapping?.templateFile ?? null,
    layoutMode: doc.templateMapping?.layoutMode ?? null,
    outputs: files,
    unmappedCounts: unmapped,
    pdf: pdf && {
      ...pdf,
      filenamePattern: project.settings.exportFilenamePattern,
      cadColorMode: usePreferences.getState().cadColorMode,
    },
    // EXP-01: what the pre-export check flagged and the user exported past.
    acceptedWarnings: options.accepted ?? [],
    failures,
  };
  await writeTextAtomic(dir, `${folder}/export_log.json`, `${JSON.stringify(log, null, 2)}\n`);
  files.push('export_log.json');
  return { folder, files, unmapped, failures };
}
