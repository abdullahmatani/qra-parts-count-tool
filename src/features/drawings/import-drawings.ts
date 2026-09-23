/**
 * Drawing import (DRW-01, DRW-03, DRW-04): copies files into `drawings/` (the
 * originals are only read, never modified), creates one drawing per PDF page,
 * and pre-fills metadata from the title block.
 */
import { addDrawings } from '@/domain/actions/drawings';
import type { Drawing } from '@/domain/schema/types';
import { guessTitleBlock } from '@/domain/title-block';
import {
  getDirectory,
  readFile,
  sanitizeFileName,
  uniqueFileName,
  writeFile,
} from '@/lib/fs/files';
import { isNotFound, type FsDirHandle } from '@/lib/fs/types';
import { sha256Hex } from '@/lib/hash';
import { newId } from '@/lib/ids';
import { requireWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { inspectPdf, type InspectedPdf } from './pdf-inspect';

export const IMPORTABLE_EXTENSIONS = ['.pdf'] as const;

export type SkipReason = 'duplicate' | 'unsupported' | 'failed';

export interface ImportReport {
  imported: { fileName: string; pages: number }[];
  skipped: { fileName: string; reason: SkipReason; detail?: string }[];
  drawingIds: string[];
}

export interface ImportDeps {
  inspect: (bytes: ArrayBuffer) => Promise<InspectedPdf>;
  now: () => Date;
}

const defaultDeps: ImportDeps = { inspect: inspectPdf, now: () => new Date() };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Copies a file into drawings/, reusing an identical copy already there (for
 * example after an import was undone) instead of creating a duplicate.
 */
async function copyIntoDrawings(
  dir: FsDirHandle,
  fileName: string,
  bytes: ArrayBuffer,
  hash: string,
): Promise<string> {
  const drawingsDir = await getDirectory(dir, 'drawings', { create: true });
  const safe = sanitizeFileName(fileName, 'drawing.pdf');
  try {
    const existing = await readFile(dir, `drawings/${safe}`);
    if (
      existing.size === bytes.byteLength &&
      (await sha256Hex(await existing.arrayBuffer())) === hash
    ) {
      return safe;
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const name = await uniqueFileName(drawingsDir, safe);
  await writeFile(dir, `drawings/${name}`, bytes);
  return name;
}

export async function importDrawingFiles(
  files: readonly File[],
  onProgress?: (done: number, total: number, fileName: string) => void,
  deps: ImportDeps = defaultDeps,
): Promise<ImportReport> {
  const dir = requireWorkingDirectory();
  const doc = useProjectStore.getState().doc;
  if (!doc) throw new Error('No project is open');
  const knownHashes = new Set(Object.values(doc.drawings).map((d) => d.fileHash));
  const report: ImportReport = { imported: [], skipped: [], drawingIds: [] };
  const created: Drawing[] = [];

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length, file.name);
    if (!(IMPORTABLE_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
      report.skipped.push({ fileName: file.name, reason: 'unsupported' });
      continue;
    }
    try {
      const bytes = await file.arrayBuffer();
      const hash = await sha256Hex(bytes);
      if (knownHashes.has(hash)) {
        report.skipped.push({ fileName: file.name, reason: 'duplicate' });
        continue;
      }
      const inspected = await deps.inspect(bytes);
      const fileName = await copyIntoDrawings(dir, file.name, bytes, hash);
      const importedAt = deps.now().toISOString();
      for (const page of inspected.pages) {
        const guess = guessTitleBlock(page.text, page.textFrameSize, file.name);
        created.push({
          id: newId('drw'),
          fileName,
          originalFileName: file.name,
          fileHash: hash,
          fileType: 'pdf',
          page: page.pageNumber,
          layout: null,
          isCadPlot: false,
          drawingNo: guess.drawingNo,
          sheet: guess.sheet || (inspected.pages.length > 1 ? String(page.pageNumber) : ''),
          title: guess.title,
          revision: guess.revision,
          size: page.size,
          importedAt,
          needsReview: false,
        });
      }
      knownHashes.add(hash);
      report.imported.push({ fileName: file.name, pages: inspected.pages.length });
    } catch (error) {
      report.skipped.push({
        fileName: file.name,
        reason: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  onProgress?.(files.length, files.length, '');

  if (created.length > 0) {
    useProjectStore
      .getState()
      .apply(
        created.length === 1 ? 'Import drawing' : `Import ${created.length} drawings`,
        (draft) => addDrawings(draft, created),
      );
  }
  report.drawingIds = created.map((d) => d.id);
  return report;
}
