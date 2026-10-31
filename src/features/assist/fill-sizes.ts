/**
 * Fill sizes from line numbers (CNT-01): counted items on a drawing that have
 * no size yet take the size of the line they sit on, read from the drawing's
 * line numbers. Only empty sizes are filled, never one the user entered. An
 * item whose line size cannot be read stays empty, pending for the user, and
 * is flagged as incomplete until they enter it.
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { updateItem } from '@/domain/actions/items';
import { sizeSourceOf } from '@/domain/line-labels';
import { formatSize } from '@/domain/sizes';
import { symbolRadius } from '@/domain/symbol-examples';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { readSymbolSizes, type LineSize } from './line-sizes';

const t = i18n.t.bind(i18n);

/** Whether sizes are being read, for the button's spinner. */
export const useFillSizesStore = create<{ busy: boolean }>()(() => ({ busy: false }));

/** The items on a drawing whose size is still to enter and could be read from a line. */
export function itemsWithoutSize(drawingId: string) {
  const doc = useProjectStore.getState().doc;
  if (!doc) return [];
  const types = new Map(doc.library.equipmentTypes.map((t) => [t.id, t]));
  return Object.values(doc.items).filter((item) => {
    if (item.drawingId !== drawingId || item.nominalSize !== null) return false;
    const marker = doc.markers[item.markerId];
    const type = item.equipmentTypeId ? types.get(item.equipmentTypeId) : undefined;
    return marker?.geometry.type === 'circle' && !marker.esdv && sizeSourceOf(type) !== null;
  });
}

/** Selects markers and brings the first into view. */
function show(drawingId: string, markerIds: readonly string[]) {
  const doc = useProjectStore.getState().doc;
  const first = markerIds.map((id) => doc?.markers[id]).find((m) => m?.geometry.type === 'circle');
  useUiStore.getState().setSelection([...markerIds]);
  if (first?.geometry.type !== 'circle') return;
  const { cx, cy, r } = first.geometry;
  const pad = r * 6;
  useUiStore
    .getState()
    .focusDrawing(drawingId, { minX: cx - pad, minY: cy - pad, maxX: cx + pad, maxY: cy + pad });
}

/**
 * Reads the line size of every item on the drawing that has no size, and
 * fills in those found, as one undo step. Returns how many were filled.
 */
export async function fillSizesFromLines(drawingId: string): Promise<number> {
  const { doc, readOnly } = useProjectStore.getState();
  if (!doc || readOnly || useFillSizesStore.getState().busy) return 0;
  const items = itemsWithoutSize(drawingId);
  if (items.length === 0) {
    toast(t('lineSizes.nothingToFill'));
    return 0;
  }
  useFillSizesStore.setState({ busy: true });
  let sizes: Map<string, LineSize>;
  try {
    sizes = await readSymbolSizes(
      drawingId,
      items.map((item) => {
        const marker = doc.markers[item.markerId]!;
        const geometry = marker.geometry as { cx: number; cy: number };
        return {
          id: marker.id,
          cx: geometry.cx,
          cy: geometry.cy,
          r: symbolRadius(marker),
          typeId: item.equipmentTypeId,
        };
      }),
    );
  } catch (error) {
    toast.error(t('lineSizes.failed', { message: error instanceof Error ? error.message : error }));
    return 0;
  } finally {
    useFillSizesStore.setState({ busy: false });
  }

  const found = items.flatMap((item) => {
    const size = sizes.get(item.markerId);
    return size?.status === 'found' ? [{ item, size }] : [];
  });
  const pending = items.filter((item) => sizes.get(item.markerId)?.status !== 'found');
  const filled =
    found.length > 0 &&
    useProjectStore.getState().apply(t('lineSizes.history', { count: found.length }), (draft) => {
      for (const { item, size } of found) {
        // The user may have typed a size while the sheet was read.
        if (draft.items[item.id]?.nominalSize !== null) continue;
        updateItem(draft, item.id, { nominalSize: size.size.value, sizeUnit: size.size.unit });
      }
    });
  const count = filled ? found.length : 0;
  const sizesFound = [...new Set(found.map(({ size }) => formatSize(size.size)))];
  const message = [
    count > 0
      ? t('lineSizes.filled', { count, sizes: sizesFound.join(', ') })
      : t('lineSizes.noneFound'),
    ...(pending.length ? [t('lineSizes.pending', { count: pending.length })] : []),
  ].join(' ');
  const pendingIds = pending.map((item) => item.markerId);
  toast[count > 0 ? 'success' : 'message'](message, {
    duration: 8000,
    ...(pendingIds.length
      ? {
          action: {
            label: t('lineSizes.showPending'),
            onClick: () => show(drawingId, pendingIds),
          },
        }
      : {}),
  });
  return count;
}
