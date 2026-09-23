/** Count item commands for the item editor (CNT-01, CNT-03, CNT-08, CNT-12). */
import { addItem, updateItem, type ItemPatch } from '@/domain/actions/items';
import { acceptDuplicate, unacceptDuplicate } from '@/domain/count/count';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const t = i18n.t.bind(i18n);

/** Edits an item; typing merges into one undo step per field. Remembers type and actuation. */
export function updateItemCommand(itemId: string, patch: ItemPatch): boolean {
  const project = useProjectStore.getState();
  const item = project.doc?.items[itemId];
  if (!item) return false;
  const fields = Object.keys(patch).sort().join(',');
  const done = project.apply(
    t('count.history.editItem', { seq: item.seq }),
    (draft) => updateItem(draft, itemId, patch),
    { coalesceKey: `item:${itemId}:${fields}` },
  );
  if (done) useUiStore.getState().setLastItem(itemId);
  if (done && (patch.equipmentTypeId !== undefined || patch.actuation !== undefined)) {
    const updated = useProjectStore.getState().doc?.items[itemId];
    useUiStore.getState().setItemDefaults({
      equipmentTypeId: updated?.equipmentTypeId ?? null,
      ...(updated?.actuation ? { actuation: updated.actuation } : {}),
    });
  }
  return done;
}

/** Adds a count item to a marker placed without one (e.g. before the library existed). */
export function addItemCommand(markerId: string): string | null {
  let id: string | null = null;
  const defaults = useUiStore.getState().itemDefaults;
  useProjectStore.getState().apply(t('count.history.addItem'), (draft) => {
    id = addItem(draft, markerId, defaults);
  });
  if (id) useUiStore.getState().requestEdit(markerId);
  return id;
}

export function acceptDuplicateCommand(tag: string, note = ''): boolean {
  return useProjectStore
    .getState()
    .apply(t('count.history.acceptDuplicate', { tag }), (draft) =>
      acceptDuplicate(draft, tag, note, new Date()),
    );
}

export function unacceptDuplicateCommand(tag: string): boolean {
  return useProjectStore
    .getState()
    .apply(t('count.history.unacceptDuplicate', { tag }), (draft) => unacceptDuplicate(draft, tag));
}
