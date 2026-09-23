/**
 * Equipment library files (CNT-11): the library and bin sets as JSON, so the
 * same counting rules apply across projects.
 *
 * Importing merges instead of replacing, so nothing that already refers to
 * the project's library breaks: types are matched by Excel key (or by name)
 * and bin sets and bins by name and label, and matches keep their ids (items
 * and template mappings refer to them). Types and bin sets that are only in
 * the project are kept.
 */
import { newId, type IdPrefix } from '@/lib/ids';
import { Library as LibrarySchema } from './schema/v1';
import type { Bin, BinSet, EquipmentType, Library } from './schema/types';

export const LIBRARY_FILE_FORMAT = 'qrapc-library';

export interface LibraryFile {
  format: typeof LIBRARY_FILE_FORMAT;
  version: 1;
  exportedAt: string;
  library: Library;
}

export class LibraryFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryFileError';
  }
}

export function toLibraryFile(library: Library, now: Date): LibraryFile {
  return { format: LIBRARY_FILE_FORMAT, version: 1, exportedAt: now.toISOString(), library };
}

/** Reads a library file; throws LibraryFileError when it is not one. */
export function parseLibraryFile(text: string): Library {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new LibraryFileError('The file is not valid JSON.');
  }
  const file = data as Partial<LibraryFile> | null;
  if (!file || file.format !== LIBRARY_FILE_FORMAT) {
    throw new LibraryFileError('The file is not an equipment library exported from this tool.');
  }
  if (file.version !== 1) {
    throw new LibraryFileError(`Library file version ${String(file.version)} is not supported.`);
  }
  const parsed = LibrarySchema.safeParse(file.library);
  if (!parsed.success) {
    throw new LibraryFileError(
      `The library in the file is not valid: ${parsed.error.issues[0]?.message ?? 'unknown problem'}.`,
    );
  }
  return parsed.data;
}

const key = (text: string) => text.trim().toLowerCase();

export interface MergeSummary {
  typesAdded: number;
  typesUpdated: number;
  binSetsAdded: number;
  binSetsUpdated: number;
}

/** Merges an imported library into the project's (see the module comment). */
export function mergeLibrary(
  current: Library,
  incoming: Library,
): { library: Library; summary: MergeSummary } {
  const summary: MergeSummary = {
    typesAdded: 0,
    typesUpdated: 0,
    binSetsAdded: 0,
    binSetsUpdated: 0,
  };
  const usedIds = new Set<string>([
    ...current.binSets.flatMap((s) => [s.id, ...s.bins.map((b) => b.id)]),
    ...current.equipmentTypes.map((t) => t.id),
  ]);
  const freshId = (id: string, prefix: IdPrefix) => {
    let next = id;
    while (usedIds.has(next)) next = newId(prefix);
    usedIds.add(next);
    return next;
  };

  // Bin sets by name; bins by label, so mapped count cells keep working.
  const binSets: BinSet[] = current.binSets.map((set) => ({ ...set, bins: [...set.bins] }));
  const binSetIdMap = new Map<string, string>();
  for (const set of incoming.binSets) {
    const match = binSets.find((s) => key(s.name) === key(set.name));
    if (match) {
      const bins: Bin[] = set.bins.map((bin) => {
        const same = match.bins.find((b) => key(b.label) === key(bin.label));
        return { ...bin, id: same?.id ?? freshId(bin.id, 'bin') };
      });
      Object.assign(match, { name: set.name, bins });
      binSetIdMap.set(set.id, match.id);
      summary.binSetsUpdated += 1;
    } else {
      const added: BinSet = {
        ...set,
        id: freshId(set.id, 'bns'),
        bins: set.bins.map((bin) => ({ ...bin, id: freshId(bin.id, 'bin') })),
      };
      binSets.push(added);
      binSetIdMap.set(set.id, added.id);
      summary.binSetsAdded += 1;
    }
  }
  const mapSet = (id: string | null) => (id === null ? null : (binSetIdMap.get(id) ?? null));

  // Types by Excel key when both have one, otherwise by name.
  const types: EquipmentType[] = current.equipmentTypes.map((t) => ({ ...t }));
  const typeIdMap = new Map<string, string>();
  for (const type of incoming.equipmentTypes) {
    const match = types.find((t) =>
      type.excelKey.trim() && t.excelKey.trim()
        ? key(t.excelKey) === key(type.excelKey)
        : key(t.name) === key(type.name),
    );
    const { id: incomingId, ...fields } = type;
    const resolved: Omit<EquipmentType, 'id'> = {
      ...fields,
      binSetId: mapSet(type.binSetId),
      actuationBinSetIds: {
        manual: mapSet(type.actuationBinSetIds.manual),
        automated: mapSet(type.actuationBinSetIds.automated),
      },
    };
    if (match) {
      Object.assign(match, resolved);
      typeIdMap.set(incomingId, match.id);
      summary.typesUpdated += 1;
    } else {
      const added = { ...resolved, id: freshId(incomingId, 'eqt') };
      types.push(added);
      typeIdMap.set(incomingId, added.id);
      summary.typesAdded += 1;
    }
  }

  // One type per shortcut key: an imported key wins over one already in the project.
  const importedIds = new Set(typeIdMap.values());
  const taken = new Map<string, string>();
  for (const type of types.filter((t) => importedIds.has(t.id))) {
    if (type.shortcut) taken.set(key(type.shortcut), type.id);
  }
  for (const type of types) {
    if (!type.shortcut) continue;
    const owner = taken.get(key(type.shortcut));
    if (owner && owner !== type.id) type.shortcut = null;
    else taken.set(key(type.shortcut), type.id);
  }

  const esdv = incoming.esdvEquipmentTypeId
    ? (typeIdMap.get(incoming.esdvEquipmentTypeId) ?? current.esdvEquipmentTypeId)
    : current.esdvEquipmentTypeId;
  return {
    library: {
      datasetName: incoming.datasetName.trim() ? incoming.datasetName : current.datasetName,
      datasetDescription: incoming.datasetDescription.trim()
        ? incoming.datasetDescription
        : current.datasetDescription,
      equipmentTypes: types,
      binSets,
      esdvEquipmentTypeId: esdv,
    },
    summary,
  };
}
