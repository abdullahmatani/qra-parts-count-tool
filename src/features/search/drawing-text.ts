/**
 * The text of a drawing as boxes in drawing coordinates, for search (DRW-08):
 * PDF text runs from PDF.js, DWG/DXF text from the display list. Kept in
 * memory for recently searched drawings, keyed by file hash, so a revision
 * replacement is searched afresh.
 */
import type { Drawing } from '@/domain/schema/types';
import type { TextBox } from '@/domain/text-search';
import type { DisplayList, TextRun } from '@/features/cad/display-list';
import { readFile } from '@/lib/fs/files';
import type { FsDirHandle } from '@/lib/fs/types';

const CACHE_SIZE = 64;
const cache = new Map<string, Promise<TextBox[]>>();

function cacheKey(drawing: Drawing): string {
  return `${drawing.fileHash}:${drawing.page ?? ''}:${drawing.layout ?? ''}`;
}

/** Box of a CAD text run: its local frame (align, baseline) mapped like the canvas renderer. */
export function cadRunBox(run: TextRun): TextBox {
  const w = run.text.length * run.size * 0.55;
  const u0 = run.align === 'center' ? -w / 2 : run.align === 'right' ? -w : 0;
  const [v0, v1] =
    run.baseline === 'middle'
      ? [-0.45 * run.size, 0.45 * run.size]
      : run.baseline === 'top'
        ? [0, run.size]
        : run.baseline === 'bottom'
          ? [-run.size, 0]
          : [-0.8 * run.size, 0.2 * run.size];
  // Same frame as the canvas renderer's transform(a, b, -c, -d, x, y).
  const corners = [
    [u0, v0],
    [u0 + w, v0],
    [u0, v1],
    [u0 + w, v1],
  ].map(([u, v]) => [run.x + run.a * u! - run.c * v!, run.y + run.b * u! - run.d * v!]);
  const xs = corners.map((p) => p[0]!);
  const ys = corners.map((p) => p[1]!);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { text: run.text, x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function displayListBoxes(list: DisplayList): TextBox[] {
  return list.groups.flatMap((group) =>
    group.texts.filter((run) => run.text.trim()).map(cadRunBox),
  );
}

async function extract(dir: FsDirHandle, drawing: Drawing): Promise<TextBox[]> {
  if (drawing.fileType === 'pdf') {
    const { pdfCache } = await import('@/features/viewer/load-source');
    const source = await pdfCache.openPage(
      `${drawing.fileName}#${drawing.fileHash}`,
      async () => (await readFile(dir, `drawings/${drawing.fileName}`)).arrayBuffer(),
      drawing.page ?? 1,
    );
    try {
      return await source.textBoxes();
    } finally {
      // The viewer may be showing this page: leave its parsed state alone.
      source.dispose(false);
    }
  }
  const { loadCadDisplayList } = await import('@/features/cad/cad-drawings');
  return displayListBoxes(await loadCadDisplayList(dir, drawing));
}

export function drawingTextBoxes(dir: FsDirHandle, drawing: Drawing): Promise<TextBox[]> {
  const key = cacheKey(drawing);
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key);
  } else {
    entry = extract(dir, drawing);
    entry.catch(() => cache.delete(key));
  }
  cache.set(key, entry);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return entry;
}

export function clearDrawingTextCache(): void {
  cache.clear();
}
