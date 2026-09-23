/**
 * Equipment library edits (CNT-02, CNT-04). Types and bin sets are user data;
 * removing one never deletes items: they become incomplete instead, so the
 * pre-export check lists them.
 */
import { newId } from '@/lib/ids';
import { binLabel } from '../count/bins';
import { starterLibrary } from '../count/starter-library';
import type { ProjectDoc } from '../model';
import type { Bin, EquipmentType, Library } from '../schema/types';

type LibraryDoc = Pick<ProjectDoc, 'library' | 'items'>;

export function updateDataset(
  doc: LibraryDoc,
  patch: Partial<Pick<Library, 'datasetName' | 'datasetDescription'>>,
): void {
  if (patch.datasetName !== undefined) doc.library.datasetName = patch.datasetName;
  if (patch.datasetDescription !== undefined) {
    doc.library.datasetDescription = patch.datasetDescription;
  }
}

export function addEquipmentType(doc: LibraryDoc, input: Partial<EquipmentType> = {}): string {
  const type: EquipmentType = {
    id: newId('eqt'),
    name: 'New type',
    category: 'other',
    hasActuation: false,
    binSetId: doc.library.binSets[0]?.id ?? null,
    actuationBinSetIds: { manual: null, automated: null },
    sizeRequired: true,
    excelKey: '',
    datasetCategory: '',
    shortcut: null,
    ...input,
  };
  doc.library.equipmentTypes.push(type);
  return type.id;
}

export type EquipmentTypePatch = Partial<Omit<EquipmentType, 'id'>>;

export function updateEquipmentType(
  doc: LibraryDoc,
  typeId: string,
  patch: EquipmentTypePatch,
): void {
  const type = doc.library.equipmentTypes.find((t) => t.id === typeId);
  if (!type) return;
  if (patch.shortcut) {
    // ANN-08: a shortcut key belongs to one type only.
    for (const other of doc.library.equipmentTypes) {
      if (other.id !== typeId && other.shortcut === patch.shortcut) other.shortcut = null;
    }
  }
  for (const [key, value] of Object.entries(patch) as [keyof EquipmentTypePatch, never][]) {
    if (value !== undefined) (type as Record<string, unknown>)[key] = value;
  }
  if (!type.hasActuation) {
    for (const item of Object.values(doc.items)) {
      if (item.equipmentTypeId === typeId && item.actuation !== null) item.actuation = null;
    }
  }
}

/** Removes a type; its items lose their type and show as incomplete. */
export function deleteEquipmentType(doc: LibraryDoc, typeId: string): void {
  doc.library.equipmentTypes = doc.library.equipmentTypes.filter((t) => t.id !== typeId);
  if (doc.library.esdvEquipmentTypeId === typeId) doc.library.esdvEquipmentTypeId = null;
  for (const item of Object.values(doc.items)) {
    if (item.equipmentTypeId === typeId) {
      item.equipmentTypeId = null;
      item.actuation = null;
    }
  }
}

export function moveEquipmentType(doc: LibraryDoc, typeId: string, toIndex: number): void {
  const list = doc.library.equipmentTypes;
  const from = list.findIndex((t) => t.id === typeId);
  if (from < 0) return;
  const [type] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, type!);
}

export function setEsdvEquipmentType(doc: LibraryDoc, typeId: string | null): void {
  if (typeId === null || doc.library.equipmentTypes.some((t) => t.id === typeId)) {
    doc.library.esdvEquipmentTypeId = typeId;
  }
}

/** Adds a bin set, optionally copying another's bins. */
export function addBinSet(doc: LibraryDoc, name: string, copyFromId?: string): string {
  const source = copyFromId ? doc.library.binSets.find((b) => b.id === copyFromId) : undefined;
  const id = newId('bns');
  doc.library.binSets.push({
    id,
    name,
    bins: source ? source.bins.map((bin) => ({ ...bin, id: newId('bin') })) : [],
  });
  return id;
}

export function renameBinSet(doc: LibraryDoc, binSetId: string, name: string): void {
  const binSet = doc.library.binSets.find((b) => b.id === binSetId);
  if (binSet && name.trim()) binSet.name = name.trim();
}

/** Removes a bin set; types that used it are left without one (their items show as incomplete). */
export function deleteBinSet(doc: LibraryDoc, binSetId: string): void {
  doc.library.binSets = doc.library.binSets.filter((b) => b.id !== binSetId);
  for (const type of doc.library.equipmentTypes) {
    if (type.binSetId === binSetId) type.binSetId = null;
    if (type.actuationBinSetIds.manual === binSetId) type.actuationBinSetIds.manual = null;
    if (type.actuationBinSetIds.automated === binSetId) type.actuationBinSetIds.automated = null;
  }
}

export type BinEdges = Pick<Bin, 'lower' | 'lowerInclusive' | 'upper' | 'upperInclusive'>;

/** Appends a bin continuing from the last one: lower edge = last upper edge. */
export function addBin(doc: LibraryDoc, binSetId: string): string | null {
  const binSet = doc.library.binSets.find((b) => b.id === binSetId);
  if (!binSet) return null;
  const last = binSet.bins[binSet.bins.length - 1];
  const lower = last ? last.upper : null;
  const edges: BinEdges = {
    lower,
    lowerInclusive: last ? !last.upperInclusive : false,
    upper: null,
    upperInclusive: true,
  };
  const id = newId('bin');
  binSet.bins.push({ id, label: binLabel(edges), ...edges });
  return id;
}

/**
 * Changes a bin's edges or label. Changing an edge regenerates the label from
 * the edges, unless a label is given in the same patch.
 */
export function updateBin(
  doc: LibraryDoc,
  binSetId: string,
  binId: string,
  patch: Partial<Omit<Bin, 'id'>>,
): void {
  const bin = doc.library.binSets.find((b) => b.id === binSetId)?.bins.find((b) => b.id === binId);
  if (!bin) return;
  Object.assign(bin, patch);
  const edgeChanged = ['lower', 'lowerInclusive', 'upper', 'upperInclusive'].some(
    (key) => key in patch,
  );
  if (edgeChanged && patch.label === undefined) bin.label = binLabel(bin);
}

export function deleteBin(doc: LibraryDoc, binSetId: string, binId: string): void {
  const binSet = doc.library.binSets.find((b) => b.id === binSetId);
  if (binSet) binSet.bins = binSet.bins.filter((b) => b.id !== binId);
}

/**
 * Adds the starter library's types and bin sets that the project does not
 * have yet (matched by name), so an empty or partial library can be filled in.
 */
export function addStarterLibrary(doc: LibraryDoc): number {
  const starter = starterLibrary();
  const binSetIds = new Map<string, string>();
  for (const binSet of starter.binSets) {
    const existing = doc.library.binSets.find((b) => b.name === binSet.name);
    if (existing) binSetIds.set(binSet.id, existing.id);
    else {
      doc.library.binSets.push(binSet);
      binSetIds.set(binSet.id, binSet.id);
    }
  }
  const remap = (id: string | null) => (id ? (binSetIds.get(id) ?? null) : null);
  let added = 0;
  const shortcuts = new Set(doc.library.equipmentTypes.map((t) => t.shortcut).filter(Boolean));
  for (const type of starter.equipmentTypes) {
    if (doc.library.equipmentTypes.some((t) => t.name === type.name)) continue;
    doc.library.equipmentTypes.push({
      ...type,
      binSetId: remap(type.binSetId),
      actuationBinSetIds: {
        manual: remap(type.actuationBinSetIds.manual),
        automated: remap(type.actuationBinSetIds.automated),
      },
      shortcut: type.shortcut && !shortcuts.has(type.shortcut) ? type.shortcut : null,
    });
    added += 1;
  }
  if (!doc.library.esdvEquipmentTypeId) {
    const valve = doc.library.equipmentTypes.find((t) => t.category === 'valve' && t.hasActuation);
    doc.library.esdvEquipmentTypeId = valve?.id ?? null;
  }
  return added;
}
