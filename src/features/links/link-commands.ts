/** Drawing link commands (LNK-01..03). */
import { toast } from 'sonner';
import {
  addLink,
  deleteLink,
  linkStatus,
  updateLink,
  type LinkPatch,
} from '@/domain/actions/links';
import type { Box } from '@/domain/markup/geometry';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

const t = i18n.t.bind(i18n);

export function createLinkCommand(drawingId: string, box: Box): string | null {
  let id: string | null = null;
  useProjectStore.getState().apply(t('links.history.add'), (draft) => {
    id = addLink(draft, drawingId, box);
  });
  if (id) useUiStore.getState().setSelectedLink(id);
  return id;
}

export function updateLinkCommand(linkId: string, patch: LinkPatch): boolean {
  const fields = Object.keys(patch).sort().join(',');
  return useProjectStore
    .getState()
    .apply(t('links.history.edit'), (draft) => updateLink(draft, linkId, patch), {
      coalesceKey: `link:${linkId}:${fields}`,
    });
}

export function deleteLinkCommand(linkId: string): boolean {
  const done = useProjectStore
    .getState()
    .apply(t('links.history.delete'), (draft) => deleteLink(draft, linkId));
  if (done && useUiStore.getState().selectedLinkId === linkId) {
    useUiStore.getState().setSelectedLink(null);
  }
  return done;
}

/**
 * Deletes a link the user asked to delete. A link that leads to a drawing is
 * worth keeping, so it asks first (DeleteLinkDialog); one without a target, or
 * whose target was removed, goes straight away. Either way it can be undone.
 */
export function requestDeleteLink(linkId: string): boolean {
  const doc = useProjectStore.getState().doc;
  const link = doc?.links[linkId];
  if (!doc || !link || useProjectStore.getState().readOnly) return false;
  if (linkStatus(link, doc) === 'ok') {
    useUiStore.getState().setLinkDeleteRequest(linkId);
    return true;
  }
  return deleteLinkCommand(linkId);
}

/** LNK-02: opens the link's target drawing (at its saved view) and remembers where we were. */
export function followLink(linkId: string): boolean {
  const doc = useProjectStore.getState().doc;
  const link = doc?.links[linkId];
  if (!doc || !link) return false;
  const status = linkStatus(link, doc);
  if (status !== 'ok') {
    toast.error(t(`links.status.${status}`));
    return false;
  }
  const ui = useUiStore.getState();
  const target = link.targetDrawingId!;
  ui.pushNav({ drawingId: link.sourceDrawingId, view: ui.viewports[link.sourceDrawingId] ?? null });
  ui.openDrawing(target);
  if (link.targetView) {
    const rotation = ui.viewports[target]?.rotation ?? 0;
    ui.setViewport(target, { ...link.targetView, rotation });
  }
  return true;
}

/** LNK-02: returns to the drawing and view before the last followed link. */
export function goBack(): boolean {
  const ui = useUiStore.getState();
  const entry = ui.popNav();
  const doc = useProjectStore.getState().doc;
  if (!entry || !doc?.drawings[entry.drawingId]) return false;
  ui.openDrawing(entry.drawingId);
  if (entry.view) ui.setViewport(entry.drawingId, entry.view);
  return true;
}
