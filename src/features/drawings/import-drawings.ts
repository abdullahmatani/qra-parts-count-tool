/**
 * Drawing import (DRW-01, DRW-02, DRW-03, DRW-04, DRW-10): copies files into
 * `drawings/` (the originals are only read, never modified), creates one
 * drawing per PDF page or per chosen DWG/DXF space, and pre-fills metadata
 * from the title block. A page or layout already in the project is not
 * imported twice, but importing a file again brings back the pages and
 * layouts whose drawings were deleted.
 */
import { addDrawings } from '@/domain/actions/drawings';
import type { ProjectDoc } from '@/domain/model';
import type { Drawing } from '@/domain/schema/types';
import { guessTitleBlock, type TextItem, type TitleBlockGuess } from '@/domain/title-block';
import type { CadHandle } from '@/features/cad/cad-client';
import { displayListText, type DisplayList, type SpaceInfo } from '@/features/cad/display-list';
import { MODEL_SPACE } from '@/features/cad/model';
import type { FsDirHandle } from '@/lib/fs/types';
import { sha256Hex } from '@/lib/hash';
import { newId } from '@/lib/ids';
import { requireWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { copyIntoDrawings } from './drawing-files';
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
  /** Spaces that are drawings in the project already; they cannot be chosen again. */
  importedSpaces: string[];
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
  /** Name drawings after their files instead of the title block's drawing number and sheet. */
  nameFromFile: boolean;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** A file name without its extension: PEFS-1001_A1.pdf is PEFS-1001_A1. */
export function fileStem(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

/**
 * The name of a drawing: its drawing number and sheet. Named after the file,
 * the sheet is the page or layout, and only when the file holds several
 * drawings (`part` is then non-empty), so every drawing of one file gets a
 * distinct name. Otherwise both come from the title block, with the page or
 * layout as the sheet when the title block has none.
 */
function drawingName(
  guess: TitleBlockGuess,
  fileName: string,
  part: string,
  nameFromFile: boolean,
): Pick<Drawing, 'drawingNo' | 'sheet'> {
  if (nameFromFile) return { drawingNo: fileStem(fileName), sheet: part };
  return { drawingNo: guess.drawingNo, sheet: guess.sheet || part };
}

/** Default picker selection: paper layouts that have content, otherwise model space. */
export function defaultSpaces(spaces: readonly SpaceInfo[]): string[] {
  const layouts = spaces.filter(
    (space) => space.name !== MODEL_SPACE && (space.viewports > 0 || space.entities > 1),
  );
  return layouts.length > 0 ? layouts.map((space) => space.name) : [MODEL_SPACE];
}

/** Title-block text of a CAD display list, in the TextItem form the heuristics use. */
export function cadTextItems(list: DisplayList): TextItem[] {
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

/** The pages and layouts of each file (by hash) that are drawings in the project. */
function importedSheets(doc: ProjectDoc): Map<string, Set<string>> {
  const sheets = new Map<string, Set<string>>();
  for (const drawing of Object.values(doc.drawings)) {
    let set = sheets.get(drawing.fileHash);
    if (!set) sheets.set(drawing.fileHash, (set = new Set()));
    set.add(drawing.layout ?? `page ${drawing.page ?? 1}`);
  }
  return sheets;
}

export async function importDrawingFiles(
  files: readonly File[],
  onProgress: ((done: number, total: number, fileName: string) => void) | undefined,
  deps: ImportDeps,
): Promise<ImportReport> {
  const dir = requireWorkingDirectory();
  const doc = useProjectStore.getState().doc;
  if (!doc) throw new Error('No project is open');
  const imported = importedSheets(doc);
  // The same content twice in one import is imported once.
  const seen = new Set<string>();
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
      if (seen.has(hash)) {
        report.skipped.push({ fileName: file.name, reason: 'duplicate' });
        continue;
      }
      const present = imported.get(hash) ?? new Set<string>();
      if (extension === '.pdf') {
        const inspected = await deps.inspect(bytes);
        const pages = inspected.pages.filter((page) => !present.has(`page ${page.pageNumber}`));
        if (pages.length === 0) {
          report.skipped.push({ fileName: file.name, reason: 'duplicate' });
          seen.add(hash);
          continue;
        }
        const fileName = await copyIntoDrawings(dir, file.name, bytes, hash);
        const importedAt = deps.now().toISOString();
        const isCadPlot = isCadPlotProducer(inspected.producer);
        for (const page of pages) {
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
            ...drawingName(
              guess,
              file.name,
              inspected.pages.length > 1 ? String(page.pageNumber) : '',
              deps.nameFromFile,
            ),
            title: guess.title,
            revision: guess.revision,
            size: page.size,
            importedAt,
            needsReview: false,
          });
        }
        report.imported.push({ fileName: file.name, pages: pages.length });
      } else {
        const fileType = extension === '.dwg' ? 'dwg' : 'dxf';
        if (fileType === 'dwg' && !deps.cad.available()) {
          report.skipped.push({ fileName: file.name, reason: 'dwgUnavailable' });
          continue;
        }
        // The worker takes ownership of the buffer it is given, so keep our own copy.
        const handle = await deps.cad.open(bytes.slice(0), fileType);
        const importedSpaces = handle.spaces
          .map((space) => space.name)
          .filter((name) => present.has(name));
        if (importedSpaces.length === handle.spaces.length) {
          await deps.cad.close(handle);
          report.skipped.push({ fileName: file.name, reason: 'duplicate' });
          seen.add(hash);
          continue;
        }
        pendingCad.push({
          file,
          bytes,
          hash,
          handle,
          candidate: {
            fileName: file.name,
            fileType,
            spaces: handle.spaces,
            defaultSpaces: defaultSpaces(handle.spaces).filter(
              (name) => !importedSpaces.includes(name),
            ),
            importedSpaces,
          },
        });
      }
      seen.add(hash);
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
      const { candidate } = pending;
      const spaces = (choices?.[index] ?? []).filter(
        (space) => !candidate.importedSpaces.includes(space),
      );
      try {
        if (spaces.length === 0) {
          report.skipped.push({
            fileName: pending.file.name,
            // Nothing new chosen from a file that is in the project already.
            reason: candidate.importedSpaces.length > 0 ? 'duplicate' : 'noSpaces',
          });
          continue;
        }
        // Build every chosen space before copying the file, so a file that
        // cannot be read is not left behind in drawings/.
        const built: { space: string; list: DisplayList }[] = [];
        for (const space of spaces) {
          const list = await deps.cad.build(pending.handle, space);
          await deps.cad.writeCache(dir, pending.hash, list).catch(() => {});
          built.push({ space, list });
        }
        const fileName = await copyIntoDrawings(
          dir,
          pending.file.name,
          pending.bytes,
          pending.hash,
        );
        const importedAt = deps.now().toISOString();
        for (const { space, list } of built) {
          const guess = guessTitleBlock(cadTextItems(list), list, pending.file.name);
          created.push({
            id: newId('drw'),
            fileName,
            originalFileName: pending.file.name,
            fileHash: pending.hash,
            fileType: candidate.fileType,
            page: null,
            layout: space,
            isCadPlot: false,
            ...drawingName(
              guess,
              pending.file.name,
              // Layouts imported before count too, so a re-imported one keeps its layout name.
              spaces.length + candidate.importedSpaces.length > 1 ? space : '',
              deps.nameFromFile,
            ),
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
