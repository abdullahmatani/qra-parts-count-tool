/**
 * Drawing revision replacement (DRW-07, LNK-05): reads the new revision's
 * file, lets the user pick its page or layout, then points the drawing at it.
 * The drawing keeps its id, so markers, items and links stay; a changed sheet
 * size flags it for review.
 */
import { replaceDrawingRevision } from '@/domain/actions/drawings';
import type { Drawing, Size2D } from '@/domain/schema/types';
import { guessTitleBlock } from '@/domain/title-block';
import type { CadHandle } from '@/features/cad/cad-client';
import type { DisplayList } from '@/features/cad/display-list';
import i18n from '@/i18n';
import { sha256Hex } from '@/lib/hash';
import { requireWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { copyIntoDrawings } from './drawing-files';
import { cadTextItems, defaultSpaces } from './import-drawings';
import { inspectPdf, isCadPlotProducer } from './pdf-inspect';

const t = i18n.t.bind(i18n);

export interface RevisionOption {
  /** 1-based page for PDFs, else null. */
  page: number | null;
  /** Layout name for DWG/DXF, else null. */
  layout: string | null;
  /** Null until measured (CAD layouts are built on demand). */
  size: Size2D | null;
  /** Revision read from the title block, or ''. */
  revision: string;
}

export interface RevisionCandidate {
  file: File;
  bytes: ArrayBuffer;
  hash: string;
  fileType: Drawing['fileType'];
  isCadPlot: boolean;
  options: RevisionOption[];
  defaultIndex: number;
  handle: CadHandle | null;
  lists: Map<string, DisplayList>;
}

function fileTypeOf(name: string): Drawing['fileType'] | null {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return ext === '.pdf' ? 'pdf' : ext === '.dwg' ? 'dwg' : ext === '.dxf' ? 'dxf' : null;
}

/** Reads the chosen file; PDF pages are measured at once, CAD layouts on demand. */
export async function readRevisionFile(file: File, drawing: Drawing): Promise<RevisionCandidate> {
  const fileType = fileTypeOf(file.name);
  if (!fileType) throw new Error(t('import.skipped.unsupported', { name: file.name }));
  const bytes = await file.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (fileType === 'pdf') {
    const inspected = await inspectPdf(bytes);
    const options = inspected.pages.map((page) => ({
      page: page.pageNumber,
      layout: null,
      size: page.size,
      revision: guessTitleBlock(page.text, page.textFrameSize, file.name).revision,
    }));
    const samePage = drawing.fileType === 'pdf' && drawing.page ? drawing.page - 1 : 0;
    return {
      file,
      bytes,
      hash,
      fileType,
      isCadPlot: isCadPlotProducer(inspected.producer),
      options,
      defaultIndex: samePage < options.length ? samePage : 0,
      handle: null,
      lists: new Map(),
    };
  }
  const client = await import('@/features/cad/cad-client');
  if (fileType === 'dwg' && !client.isDwgReaderAvailable()) {
    throw new Error(t('import.skipped.dwgUnavailable', { name: file.name }));
  }
  // The worker takes the buffer it is given; keep ours for copying the file.
  const handle = await client.openCadFile(bytes.slice(0), fileType);
  const names = handle.spaces.map((space) => space.name);
  const preferred =
    drawing.layout && names.includes(drawing.layout)
      ? drawing.layout
      : (defaultSpaces(handle.spaces)[0] ?? names[0]);
  return {
    file,
    bytes,
    hash,
    fileType,
    isCadPlot: false,
    options: names.map((layout) => ({ page: null, layout, size: null, revision: '' })),
    defaultIndex: Math.max(0, names.indexOf(preferred ?? '')),
    handle,
    lists: new Map(),
  };
}

/** Builds a CAD layout to learn its paper size and title block (no-op for PDFs). */
export async function measureOption(
  candidate: RevisionCandidate,
  index: number,
): Promise<RevisionOption> {
  const option = candidate.options[index]!;
  if (option.size || !candidate.handle || !option.layout) return option;
  const client = await import('@/features/cad/cad-client');
  const list = await client.buildSpace(candidate.handle, option.layout);
  candidate.lists.set(option.layout, list);
  option.size = { width: list.width, height: list.height };
  option.revision = guessTitleBlock(cadTextItems(list), list, candidate.file.name).revision;
  return option;
}

export async function discardCandidate(candidate: RevisionCandidate | null): Promise<void> {
  if (!candidate?.handle) return;
  const client = await import('@/features/cad/cad-client');
  await client.closeCadFile(candidate.handle);
  candidate.handle = null;
}

/** Copies the file into drawings/ and points the drawing at it. Returns whether its size changed. */
export async function applyRevision(
  drawingId: string,
  candidate: RevisionCandidate,
  index: number,
  revision: string,
  now = new Date(),
): Promise<boolean> {
  const dir = requireWorkingDirectory();
  const option = await measureOption(candidate, index);
  const drawing = useProjectStore.getState().doc?.drawings[drawingId];
  if (!drawing || !option.size) throw new Error(t('revision.failed'));
  const fileName = await copyIntoDrawings(
    dir,
    candidate.file.name,
    candidate.bytes,
    candidate.hash,
  );
  if (option.layout) {
    const list = candidate.lists.get(option.layout);
    const { writeCachedDisplayList } = await import('@/features/cad/cad-cache');
    if (list) await writeCachedDisplayList(dir, candidate.hash, list).catch(() => {});
  }
  let sizeChanged = false;
  const label = drawing.drawingNo || drawing.fileName;
  useProjectStore
    .getState()
    .apply(t('revision.history', { drawing: label, revision: revision.trim() }), (draft) => {
      sizeChanged = replaceDrawingRevision(draft, drawingId, {
        fileName,
        originalFileName: candidate.file.name,
        fileHash: candidate.hash,
        fileType: candidate.fileType,
        page: option.page,
        layout: option.layout,
        isCadPlot: candidate.isCadPlot,
        size: option.size!,
        revision: revision.trim(),
        importedAt: now.toISOString(),
      });
    });
  return sizeChanged;
}
