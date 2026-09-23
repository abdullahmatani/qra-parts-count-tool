/**
 * Drawing import (DRW-01, DRW-02, DRW-03, DRW-04, DRW-10): copies files into
 * `drawings/` (the originals are only read, never modified), creates one
 * drawing per PDF page or per chosen DWG/DXF space, and pre-fills metadata
 * from the title block.
 */
import { addDrawings } from '@/domain/actions/drawings';
import type { Drawing } from '@/domain/schema/types';
import { guessTitleBlock, type TextItem } from '@/domain/title-block';
import type { CadHandle } from '@/features/cad/cad-client';
import { displayListText, type DisplayList, type SpaceInfo } from '@/features/cad/display-list';
import { MODEL_SPACE } from '@/features/cad/model';
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
import { isCadPlotProducer, type InspectedPdf } from './pdf-inspect';

export const IMPORTABLE_EXTENSIONS = ['.pdf', '.dwg', '.dxf'] as const;

export type SkipReason = 'duplicate' | 'unsupported' | 'failed' | 'dwgUnavailable' | 'noSpaces';

export interface ImportReport {
  imported: { fileName: string; pages: number }[];
  skipped: { fileName: string; reason: SkipReason; detail?: string }[];
  drawingIds: string[];
}

/** A DWG/DXF file waiting for the user to choose which spaces to import. */
export interface CadCandidate {
  fileName: string;
  fileType: 'dwg' | 'dxf';
  spaces: SpaceInfo[];
  /** Spaces preselected in the picker: layouts with content, else model space. */
  defaultSpaces: string[];
}

/** Returns the chosen space names for each candidate, or null to cancel CAD import. */
export type ChooseSpaces = (candidates: CadCandidate[]) => Promise<string[][] | null>;

export interface CadDeps {
  available(): boolean;
  open(bytes: ArrayBuffer, fileType: 'dwg' | 'dxf'): Promise<CadHandle>;
  build(handle: CadHandle, space: string): Promise<DisplayList>;
  close(handle: CadHandle): Promise<void>;
  writeCache(dir: FsDirHandle, fileHash: string, list: DisplayList): Promise<void>;
}

export interface ImportDeps {
  inspect: (bytes: ArrayBuffer) => Promise<InspectedPdf>;
  cad: CadDeps;
  chooseSpaces: ChooseSpaces;
  now: () => Date;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** Default picker selection: paper layouts that have content, otherwise model space. */
export function defaultSpaces(spaces: readonly SpaceInfo[]): string[] {
  const layouts = spaces.filter(
    (space) => space.name !== MODEL_SPACE && (space.viewports > 0 || space.entities > 1),
  );
  return layouts.length > 0 ? layouts.map((space) => space.name) : [MODEL_SPACE];
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
  const safe = sanitizeFileName(fileName, 'drawing');
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

/** Title-block text of a CAD display list, in the TextItem form the heuristics use. */
function cadTextItems(list: DisplayList): TextItem[] {
  return displayListText(list)
    .filter((item) => Math.abs(item.angle) < 5)
    .map(({ text, x, y, size, width }) => ({ text, x, y, size, width }));
}

interface PendingCad {
  file: File;
  bytes: ArrayBuffer;
  hash: string;
  handle: CadHandle;
  candidate: CadCandidate;
}

export async function importDrawingFiles(
  files: readonly File[],
  onProgress: ((done: number, total: number, fileName: string) => void) | undefined,
  deps: ImportDeps,
): Promise<ImportReport> {
  const dir = requireWorkingDirectory();
  const doc = useProjectStore.getState().doc;
  if (!doc) throw new Error('No project is open');
  const knownHashes = new Set(Object.values(doc.drawings).map((d) => d.fileHash));
  const report: ImportReport = { imported: [], skipped: [], drawingIds: [] };
  const created: Drawing[] = [];
  const pendingCad: PendingCad[] = [];

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length, file.name);
    const extension = extensionOf(file.name);
    if (!(IMPORTABLE_EXTENSIONS as readonly string[]).includes(extension)) {
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
      if (extension === '.pdf') {
        const inspected = await deps.inspect(bytes);
        const fileName = await copyIntoDrawings(dir, file.name, bytes, hash);
        const importedAt = deps.now().toISOString();
        const isCadPlot = isCadPlotProducer(inspected.producer);
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
            isCadPlot,
            drawingNo: guess.drawingNo,
            sheet: guess.sheet || (inspected.pages.length > 1 ? String(page.pageNumber) : ''),
            title: guess.title,
            revision: guess.revision,
            size: page.size,
            importedAt,
            needsReview: false,
          });
        }
        report.imported.push({ fileName: file.name, pages: inspected.pages.length });
      } else {
        const fileType = extension === '.dwg' ? 'dwg' : 'dxf';
        if (fileType === 'dwg' && !deps.cad.available()) {
          report.skipped.push({ fileName: file.name, reason: 'dwgUnavailable' });
          continue;
        }
        // The worker takes ownership of the buffer it is given, so keep our own copy.
        const handle = await deps.cad.open(bytes.slice(0), fileType);
        pendingCad.push({
          file,
          bytes,
          hash,
          handle,
          candidate: {
            fileName: file.name,
            fileType,
            spaces: handle.spaces,
            defaultSpaces: defaultSpaces(handle.spaces),
          },
        });
      }
      knownHashes.add(hash);
    } catch (error) {
      report.skipped.push({
        fileName: file.name,
        reason: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (pendingCad.length > 0) {
    const choices = await deps.chooseSpaces(pendingCad.map((p) => p.candidate));
    for (const [index, pending] of pendingCad.entries()) {
      const spaces = choices?.[index] ?? [];
      try {
        if (spaces.length === 0) {
          report.skipped.push({ fileName: pending.file.name, reason: 'noSpaces' });
          continue;
        }
        const fileName = await copyIntoDrawings(
          dir,
          pending.file.name,
          pending.bytes,
          pending.hash,
        );
        const importedAt = deps.now().toISOString();
        for (const space of spaces) {
          const list = await deps.cad.build(pending.handle, space);
          await deps.cad.writeCache(dir, pending.hash, list).catch(() => {});
          const guess = guessTitleBlock(cadTextItems(list), list, pending.file.name);
          created.push({
            id: newId('drw'),
            fileName,
            originalFileName: pending.file.name,
            fileHash: pending.hash,
            fileType: pending.candidate.fileType,
            page: null,
            layout: space,
            isCadPlot: false,
            drawingNo: guess.drawingNo,
            sheet: guess.sheet || (spaces.length > 1 ? space : ''),
            title: guess.title,
            revision: guess.revision,
            size: { width: list.width, height: list.height },
            importedAt,
            needsReview: false,
          });
        }
        report.imported.push({ fileName: pending.file.name, pages: spaces.length });
      } catch (error) {
        report.skipped.push({
          fileName: pending.file.name,
          reason: 'failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await deps.cad.close(pending.handle);
      }
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
