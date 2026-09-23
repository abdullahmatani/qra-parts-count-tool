/**
 * The parts count (CNT-01..09, CNT-12). Every total is derived from the items
 * and ESDV markers each time, so any number can be reproduced from the item
 * list (NFR-09).
 */
import { esdvCountingSegmentIds } from '../esdv';
import type { ProjectDoc } from '../model';
import type {
  Actuation,
  Bin,
  BinSet,
  CountItem,
  EquipmentType,
  Library,
  Marker,
} from '../schema/types';
import { sizeInInches, type NominalSize } from '../sizes';
import { binFor } from './bins';

export type CountDoc = Pick<
  ProjectDoc,
  'markers' | 'items' | 'segments' | 'library' | 'settings' | 'acceptedDuplicates'
>;

/** Why an item cannot be counted yet (CNT-05). */
export type ItemIssue = 'noType' | 'noSize' | 'noActuation' | 'outOfBins' | 'noBinSet' | 'noLength';

/** One countable thing: a count item, or an ESDV counted in a segment. */
export interface CountEntry {
  kind: 'item' | 'esdv';
  /** Item id, or the ESDV marker id. */
  id: string;
  markerId: string;
  drawingId: string;
  segmentId: string | null;
  typeId: string | null;
  actuation: Actuation | null;
  size: NominalSize | null;
  binSetId: string | null;
  binId: string | null;
  /** Reported quantity: the item quantity, doubled for flange faces (CNT-09). */
  quantity: number;
  /** Pipe run length in metres (CNT-12). */
  pipeLength: number | null;
  tag: string;
  seq: number | null;
  issues: ItemIssue[];
}

export interface LibraryIndex {
  types: Map<string, EquipmentType>;
  binSets: Map<string, BinSet>;
  typeOrder: Map<string, number>;
}

export function indexLibrary(library: Library): LibraryIndex {
  return {
    types: new Map(library.equipmentTypes.map((t) => [t.id, t])),
    binSets: new Map(library.binSets.map((b) => [b.id, b])),
    typeOrder: new Map(library.equipmentTypes.map((t, i) => [t.id, i])),
  };
}

/** The bin set for a type and actuation: the actuation's own set, else the type's. */
export function binSetFor(
  type: EquipmentType,
  actuation: Actuation | null,
  index: LibraryIndex,
): BinSet | null {
  const id =
    (type.hasActuation && actuation ? type.actuationBinSetIds[actuation] : null) ?? type.binSetId;
  return id ? (index.binSets.get(id) ?? null) : null;
}

interface Resolved {
  binSetId: string | null;
  binId: string | null;
  issues: ItemIssue[];
}

function resolve(
  type: EquipmentType | undefined,
  actuation: Actuation | null,
  size: NominalSize | null,
  index: LibraryIndex,
  pipeLength: number | null,
  pipeLengthCounting: boolean,
): Resolved {
  const issues: ItemIssue[] = [];
  if (!type) return { binSetId: null, binId: null, issues: ['noType'] };
  if (type.hasActuation && !actuation) issues.push('noActuation');
  const binSet = binSetFor(type, actuation, index);
  if (!binSet) issues.push('noBinSet');
  let binId: string | null = null;
  if (size) {
    const bin = binSet ? binFor(binSet, sizeInInches(size)) : null;
    if (bin) binId = bin.id;
    else if (binSet) issues.push('outOfBins');
  } else if (type.sizeRequired) {
    issues.push('noSize');
  } else if (binSet?.bins.length === 1) {
    // Unsized equipment goes in the set's only bin.
    binId = binSet.bins[0]!.id;
  } else if (binSet) {
    issues.push('noSize');
  }
  if (type.category === 'pipe' && pipeLengthCounting && pipeLength === null) {
    issues.push('noLength');
  }
  return { binSetId: binSet?.id ?? null, binId, issues };
}

function itemEntry(item: CountItem, doc: CountDoc, index: LibraryIndex): CountEntry {
  const type = item.equipmentTypeId ? index.types.get(item.equipmentTypeId) : undefined;
  const actuation = type?.hasActuation ? item.actuation : null;
  const size = item.nominalSize === null ? null : { value: item.nominalSize, unit: item.sizeUnit };
  const resolved = resolve(
    type,
    actuation,
    size,
    index,
    item.pipeLength,
    doc.settings.pipeLengthCounting,
  );
  const faces = type?.category === 'flange' && doc.settings.flangeConvention === 'perFace';
  return {
    kind: 'item',
    id: item.id,
    markerId: item.markerId,
    drawingId: item.drawingId,
    segmentId: item.segmentId,
    typeId: type?.id ?? null,
    actuation,
    size,
    ...resolved,
    quantity: item.quantity * (faces ? 2 : 1),
    pipeLength: item.pipeLength,
    tag: item.tag,
    seq: item.seq,
  };
}

/** ESDVs are counted as the library's ESDV type, automated, in the segments the rule picks. */
function esdvEntries(marker: Marker, doc: CountDoc, index: LibraryIndex): CountEntry[] {
  const esdv = marker.esdv!;
  const typeId = doc.library.esdvEquipmentTypeId;
  const type = typeId ? index.types.get(typeId) : undefined;
  const size = esdv.nominalSize === null ? null : { value: esdv.nominalSize, unit: esdv.sizeUnit };
  const actuation: Actuation | null = type?.hasActuation ? 'automated' : null;
  const resolved = resolve(type, actuation, size, index, null, false);
  return esdvCountingSegmentIds(marker, doc.settings.esdvBoundaryRule).map((segmentId) => ({
    kind: 'esdv',
    id: marker.id,
    markerId: marker.id,
    drawingId: marker.drawingId,
    segmentId,
    typeId: type?.id ?? null,
    actuation,
    size,
    ...resolved,
    quantity: 1,
    pipeLength: null,
    tag: esdv.tag,
    seq: null,
  }));
}

/** Every countable entry in the project, in item and marker order. */
export function countEntries(doc: CountDoc): CountEntry[] {
  const index = indexLibrary(doc.library);
  const entries: CountEntry[] = [];
  for (const item of Object.values(doc.items)) entries.push(itemEntry(item, doc, index));
  for (const marker of Object.values(doc.markers)) {
    if (marker.esdv) entries.push(...esdvEntries(marker, doc, index));
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Count table (CNT-06, CNT-07)
// ---------------------------------------------------------------------------

export interface CountCell {
  binId: string;
  quantity: number;
  markerIds: string[];
}

export interface CountRow {
  key: string;
  typeId: string;
  typeName: string;
  actuation: Actuation | null;
  cells: CountCell[];
  total: number;
  markerIds: string[];
}

export interface CountGroup {
  binSet: BinSet;
  rows: CountRow[];
}

export interface PipeLengths {
  binSet: BinSet;
  cells: { binId: string; metres: number; markerIds: string[] }[];
  total: number;
}

export interface CountTable {
  groups: CountGroup[];
  total: number;
  /** Items that cannot be counted yet (CNT-05). */
  incomplete: { count: number; markerIds: string[] };
  /** CNT-12: pipe lengths per size bin, when the project counts them. */
  pipeLengths: PipeLengths[];
}

/**
 * Totals by equipment type (and actuation) and size bin, for one segment or,
 * with `segmentId` null, for every segment (the project summary). Only rows
 * with something counted are listed.
 */
export function buildCountTable(
  entries: readonly CountEntry[],
  library: Library,
  segmentId: string | null,
  options: { pipeLengthCounting: boolean },
): CountTable {
  const index = indexLibrary(library);
  const inScope = entries.filter((e) =>
    segmentId === null ? e.segmentId !== null : e.segmentId === segmentId,
  );
  const groups = new Map<string, CountGroup>();
  const rows = new Map<string, CountRow>();
  const incomplete = new Set<string>();
  let incompleteCount = 0;
  let total = 0;
  const pipes = new Map<string, PipeLengths>();

  for (const entry of inScope) {
    const type = entry.typeId ? index.types.get(entry.typeId) : undefined;
    const binSet = entry.binSetId ? index.binSets.get(entry.binSetId) : undefined;
    if (type?.category === 'pipe') {
      if (!options.pipeLengthCounting) continue;
      if (entry.issues.length || !binSet || !entry.binId) {
        incompleteCount += 1;
        incomplete.add(entry.markerId);
        continue;
      }
      let lengths = pipes.get(binSet.id);
      if (!lengths) {
        lengths = {
          binSet,
          cells: binSet.bins.map((b) => ({ binId: b.id, metres: 0, markerIds: [] })),
          total: 0,
        };
        pipes.set(binSet.id, lengths);
      }
      const cell = lengths.cells.find((c) => c.binId === entry.binId)!;
      cell.metres += entry.pipeLength ?? 0;
      cell.markerIds.push(entry.markerId);
      lengths.total += entry.pipeLength ?? 0;
      continue;
    }
    if (entry.issues.length || !type || !binSet || !entry.binId) {
      incompleteCount += 1;
      incomplete.add(entry.markerId);
      continue;
    }
    let group = groups.get(binSet.id);
    if (!group) {
      group = { binSet, rows: [] };
      groups.set(binSet.id, group);
    }
    const key = `${type.id}|${entry.actuation ?? ''}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        typeId: type.id,
        typeName: type.name,
        actuation: entry.actuation,
        cells: binSet.bins.map((b) => ({ binId: b.id, quantity: 0, markerIds: [] })),
        total: 0,
        markerIds: [],
      };
      rows.set(key, row);
      group.rows.push(row);
    }
    const cell = row.cells.find((c) => c.binId === entry.binId)!;
    cell.quantity += entry.quantity;
    cell.markerIds.push(entry.markerId);
    row.total += entry.quantity;
    row.markerIds.push(entry.markerId);
    total += entry.quantity;
  }

  const order = (row: CountRow) =>
    (index.typeOrder.get(row.typeId) ?? 0) * 3 +
    (row.actuation === 'automated' ? 1 : row.actuation === 'manual' ? 2 : 0);
  const sortedGroups = [...groups.values()];
  for (const group of sortedGroups) group.rows.sort((a, b) => order(a) - order(b));
  sortedGroups.sort((a, b) => order(a.rows[0]!) - order(b.rows[0]!));

  return {
    groups: sortedGroups,
    total,
    incomplete: { count: incompleteCount, markerIds: [...incomplete] },
    pipeLengths: [...pipes.values()],
  };
}

/** The bin a size falls in for a type, for the item editor's preview. */
export function previewBin(
  library: Library,
  typeId: string | null,
  actuation: Actuation | null,
  size: NominalSize | null,
): Bin | null {
  if (!typeId || !size) return null;
  const index = indexLibrary(library);
  const type = index.types.get(typeId);
  const binSet = type ? binSetFor(type, actuation, index) : null;
  return binSet ? binFor(binSet, sizeInInches(size)) : null;
}

// ---------------------------------------------------------------------------
// Duplicate tags (CNT-08)
// ---------------------------------------------------------------------------

/** Tags compare without case, surrounding space, or space/underscore vs dash. */
export function normaliseTag(tag: string): string {
  return tag
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

export interface DuplicateTag {
  tag: string;
  /** Distinct markers carrying the tag. */
  markerIds: string[];
  drawingIds: string[];
  accepted: boolean;
}

/**
 * CNT-08: the same tag counted more than once, typically on two drawings at a
 * match line. An ESDV counted in two segments is one marker, so not a duplicate.
 */
export function findDuplicateTags(
  entries: readonly CountEntry[],
  doc: Pick<CountDoc, 'acceptedDuplicates'>,
): DuplicateTag[] {
  const byTag = new Map<string, Map<string, string>>();
  for (const entry of entries) {
    const tag = normaliseTag(entry.tag);
    if (!tag) continue;
    const markers = byTag.get(tag) ?? new Map<string, string>();
    markers.set(entry.markerId, entry.drawingId);
    byTag.set(tag, markers);
  }
  const accepted = new Set(doc.acceptedDuplicates.map((d) => normaliseTag(d.tag)));
  const out: DuplicateTag[] = [];
  for (const [tag, markers] of byTag) {
    if (markers.size < 2) continue;
    out.push({
      tag,
      markerIds: [...markers.keys()],
      drawingIds: [...new Set(markers.values())],
      accepted: accepted.has(tag),
    });
  }
  return out.sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Accepts a duplicate tag so it no longer raises a warning (CNT-08). */
export function acceptDuplicate(
  doc: Pick<ProjectDoc, 'acceptedDuplicates'>,
  tag: string,
  note: string,
  now: Date,
): void {
  const key = normaliseTag(tag);
  if (doc.acceptedDuplicates.some((d) => normaliseTag(d.tag) === key)) return;
  doc.acceptedDuplicates.push({ tag: key, note, acceptedAt: now.toISOString() });
}

export function unacceptDuplicate(doc: Pick<ProjectDoc, 'acceptedDuplicates'>, tag: string): void {
  const key = normaliseTag(tag);
  doc.acceptedDuplicates = doc.acceptedDuplicates.filter((d) => normaliseTag(d.tag) !== key);
}

// ---------------------------------------------------------------------------
// Marker warnings (FDS section 6: amber outline and status-bar count)
// ---------------------------------------------------------------------------

export type MarkerWarning = 'unassigned' | 'incomplete' | 'duplicate';

/** Warnings per marker: unassigned, incomplete item (CNT-05), unaccepted duplicate tag (CNT-08). */
export function markerWarningMap(
  doc: CountDoc,
  entries: readonly CountEntry[] = countEntries(doc),
): Map<string, MarkerWarning[]> {
  const map = new Map<string, MarkerWarning[]>();
  const add = (markerId: string, warning: MarkerWarning) => {
    const list = map.get(markerId) ?? [];
    if (!list.includes(warning)) list.push(warning);
    map.set(markerId, list);
  };
  for (const marker of Object.values(doc.markers)) {
    const unassigned = marker.esdv
      ? !marker.esdv.upstreamSegmentId && !marker.esdv.downstreamSegmentId
      : !marker.segmentId;
    if (unassigned) add(marker.id, 'unassigned');
  }
  for (const entry of entries) {
    if (entry.issues.length) add(entry.markerId, 'incomplete');
  }
  for (const duplicate of findDuplicateTags(entries, doc)) {
    if (!duplicate.accepted) for (const id of duplicate.markerIds) add(id, 'duplicate');
  }
  return map;
}
