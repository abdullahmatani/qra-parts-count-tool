import { findInText, type TextBox } from '@/domain/text-search';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { drawingTextBoxes } from './drawing-text';
import { useSearchStore } from './search-store';

/** Zooms the drawing to a hit with some room around it. */
export function showHit(drawingId: string, hit: TextBox): void {
  const pad = Math.max(60, hit.width * 2, hit.height * 6);
  useUiStore.getState().focusDrawing(drawingId, {
    minX: hit.x - pad,
    minY: hit.y - pad,
    maxX: hit.x + hit.width + pad,
    maxY: hit.y + hit.height + pad,
  });
}

let run = 0;

/** Searches every drawing in register order, reporting as it goes; a new search stops the old one. */
export async function searchProject(query: string): Promise<void> {
  const doc = useProjectStore.getState().doc;
  const dir = getWorkingDirectory();
  const store = useSearchStore.getState();
  if (!doc || !dir || !query.trim()) return;
  const token = ++run;
  const drawings = doc.drawingOrder.map((id) => doc.drawings[id]).filter((d) => d !== undefined);
  const results: { drawingId: string; count: number }[] = [];
  store.setProject({ query, results: [], done: 0, total: drawings.length });
  for (const [i, drawing] of drawings.entries()) {
    const boxes = await drawingTextBoxes(dir, drawing).catch(() => [] as TextBox[]);
    if (token !== run || useSearchStore.getState().query !== query) return;
    const count = findInText(boxes, query).length;
    if (count) results.push({ drawingId: drawing.id, count });
    useSearchStore
      .getState()
      .setProject({ query, results: [...results], done: i + 1, total: drawings.length });
  }
}

/** Opens a drawing from the project results and moves to its first hit. */
export function openResult(drawingId: string): void {
  useSearchStore.getState().setIndex(0);
  useSearchStore.getState().setJumpToFirst(true);
  useUiStore.getState().openDrawing(drawingId);
}
