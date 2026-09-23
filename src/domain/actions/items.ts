/**
 * Count item edits (CNT-01, CNT-03). Items are attached one-to-one to circle
 * markers (and to dashed line runs when pipe lengths are counted).
 */
import { newId } from '@/lib/ids';
import type { ProjectDoc } from '../model';
import type { Actuation, CountItem, SizeUnit } from '../schema/types';
import { takeItemSeq } from './markers';

export interface ItemDefaults {
  equipmentTypeId: string | null;
  actuation: Actuation | null;
  /** Stamp mode (ANN-09) repeats the size too; otherwise the size is typed per item. */
  nominalSize?: number | null;
  sizeUnit?: SizeUnit;
}

/** The item on a marker, if any. */
export function itemForMarker(
  doc: Pick<ProjectDoc, 'items'>,
  markerId: string,
): CountItem | undefined {
  return Object.values(doc.items).find((item) => item.markerId === markerId);
}

/** Adds a count item to a marker that has none, with the given defaults. Returns its id. */
export function addItem(doc: ProjectDoc, markerId: string, defaults: ItemDefaults): string | null {
  const marker = doc.markers[markerId];
  if (!marker || marker.esdv || itemForMarker(doc, markerId)) return null;
  const type = defaults.equipmentTypeId
    ? doc.library.equipmentTypes.find((t) => t.id === defaults.equipmentTypeId)
    : undefined;
  const item: CountItem = {
    id: newId('itm'),
    seq: takeItemSeq(doc),
    markerId,
    segmentId: marker.segmentId,
    drawingId: marker.drawingId,
    equipmentTypeId: type?.id ?? null,
    nominalSize: type?.sizeRequired === false ? null : (defaults.nominalSize ?? null),
    sizeUnit: defaults.sizeUnit ?? doc.settings.units.size,
    actuation: type?.hasActuation ? defaults.actuation : null,
    quantity: 1,
    tag: '',
    remarks: '',
    pipeLength: null,
  };
  doc.items[item.id] = item;
  return item.id;
}

export type ItemPatch = Partial<
  Pick<
    CountItem,
    | 'equipmentTypeId'
    | 'nominalSize'
    | 'sizeUnit'
    | 'actuation'
    | 'quantity'
    | 'tag'
    | 'remarks'
    | 'pipeLength'
  >
>;

/**
 * Edits an item. Changing to a type without actuation clears the actuation;
 * quantities are whole numbers of at least one.
 */
export function updateItem(doc: ProjectDoc, itemId: string, patch: ItemPatch): void {
  const item = doc.items[itemId];
  if (!item) return;
  const next: ItemPatch = { ...patch };
  if (next.quantity !== undefined) next.quantity = Math.max(1, Math.round(next.quantity));
  if (next.pipeLength != null && !(next.pipeLength >= 0)) delete next.pipeLength;
  if (next.nominalSize != null && !(next.nominalSize > 0)) delete next.nominalSize;
  for (const [key, value] of Object.entries(next) as [keyof ItemPatch, never][]) {
    if (value !== undefined && item[key] !== value) (item as Record<string, unknown>)[key] = value;
  }
  const type = item.equipmentTypeId
    ? doc.library.equipmentTypes.find((t) => t.id === item.equipmentTypeId)
    : undefined;
  if (!type?.hasActuation && item.actuation !== null) item.actuation = null;
}
