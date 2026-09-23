/**
 * Drawing links (LNK-01..05): hotspots on a drawing that open another drawing,
 * optionally at a saved view. They are navigation aids only and are never
 * exported (LNK-04, see domain/export/exportable.ts).
 */
import { newId } from '@/lib/ids';
import type { Box } from '../markup/geometry';
import type { ProjectDoc } from '../model';
import type { DrawingLink } from '../schema/types';

type LinkDoc = Pick<ProjectDoc, 'links' | 'drawings'>;

export function addLink(doc: LinkDoc, sourceDrawingId: string, box: Box): string | null {
  if (!doc.drawings[sourceDrawingId]) return null;
  const link: DrawingLink = {
    id: newId('lnk'),
    sourceDrawingId,
    rect: { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY },
    targetDrawingId: null,
    targetView: null,
    label: '',
  };
  doc.links[link.id] = link;
  return link.id;
}

export type LinkPatch = Partial<Pick<DrawingLink, 'targetDrawingId' | 'targetView' | 'label'>>;

export function updateLink(doc: LinkDoc, linkId: string, patch: LinkPatch): void {
  const link = doc.links[linkId];
  if (!link) return;
  if (patch.targetDrawingId !== undefined) {
    const target = patch.targetDrawingId;
    if (target === null || (doc.drawings[target] && target !== link.sourceDrawingId)) {
      if (link.targetDrawingId !== target) {
        link.targetDrawingId = target;
        // A saved view belongs to the old target.
        link.targetView = null;
      }
    }
  }
  if (patch.targetView !== undefined) link.targetView = patch.targetView;
  if (patch.label !== undefined && link.label !== patch.label) link.label = patch.label;
}

export function deleteLink(doc: Pick<ProjectDoc, 'links'>, linkId: string): void {
  delete doc.links[linkId];
}

export type LinkStatus = 'ok' | 'noTarget' | 'broken';

/** LNK-05: a link without a target, or whose target drawing was removed, is flagged. */
export function linkStatus(link: DrawingLink, doc: Pick<ProjectDoc, 'drawings'>): LinkStatus {
  if (!link.targetDrawingId) return 'noTarget';
  return doc.drawings[link.targetDrawingId] ? 'ok' : 'broken';
}

/** The link under a drawing point (the smallest, when links overlap). */
export function linkAt(
  links: readonly DrawingLink[],
  point: { x: number; y: number },
  tolerance: number,
): DrawingLink | null {
  let best: DrawingLink | null = null;
  for (const link of links) {
    const { x, y, width, height } = link.rect;
    const inside =
      point.x >= x - tolerance &&
      point.x <= x + width + tolerance &&
      point.y >= y - tolerance &&
      point.y <= y + height + tolerance;
    if (inside && (!best || width * height <= best.rect.width * best.rect.height)) best = link;
  }
  return best;
}
