/**
 * Runtime project model.
 *
 * On disk the project is a set of entity arrays (see schema/v1.ts). In memory the
 * large collections are kept as records keyed by id. This gives O(1) lookups,
 * and deleting one of 50,000 markers produces one small undo patch instead of
 * shifting the whole array (NFR-04, PRJ-09). Drawings and segments also keep an
 * explicit order, because the user can reorder them.
 *
 * Object key order in JavaScript follows insertion order for non-numeric keys,
 * and all ids start with a letter, so markers, items, notes and links keep their
 * creation order when serialised.
 */
import type {
  CountItem,
  Drawing,
  DrawingLink,
  Marker,
  Note,
  Project,
  Segment,
} from './schema/types';

export type EntityRecord<T> = Record<string, T>;

export type ProjectDoc = Omit<
  Project,
  'drawings' | 'segments' | 'markers' | 'items' | 'notes' | 'links'
> & {
  drawings: EntityRecord<Drawing>;
  drawingOrder: string[];
  segments: EntityRecord<Segment>;
  segmentOrder: string[];
  markers: EntityRecord<Marker>;
  items: EntityRecord<CountItem>;
  notes: EntityRecord<Note>;
  links: EntityRecord<DrawingLink>;
};

function toRecord<T extends { id: string }>(list: readonly T[]): EntityRecord<T> {
  const record: EntityRecord<T> = {};
  for (const entity of list) record[entity.id] = entity;
  return record;
}

/** Converts a parsed project file into the runtime model. */
export function projectToDoc(project: Project): ProjectDoc {
  const { drawings, segments, markers, items, notes, links, ...rest } = project;
  return {
    ...rest,
    drawings: toRecord(drawings),
    drawingOrder: drawings.map((d) => d.id),
    segments: toRecord(segments),
    segmentOrder: segments.map((s) => s.id),
    markers: toRecord(markers),
    items: toRecord(items),
    notes: toRecord(notes),
    links: toRecord(links),
  };
}

/** Converts the runtime model back into the on-disk shape, keeping key order stable. */
export function docToProject(doc: ProjectDoc): Project {
  const orderedDrawings = orderedValues(doc.drawings, doc.drawingOrder);
  const orderedSegments = orderedValues(doc.segments, doc.segmentOrder);
  return {
    schemaVersion: doc.schemaVersion,
    app: doc.app,
    id: doc.id,
    name: doc.name,
    client: doc.client,
    facility: doc.facility,
    studyRef: doc.studyRef,
    description: doc.description,
    countRevision: doc.countRevision,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.revision,
    settings: doc.settings,
    drawings: orderedDrawings,
    segments: orderedSegments,
    markers: Object.values(doc.markers),
    items: Object.values(doc.items),
    notes: Object.values(doc.notes),
    links: Object.values(doc.links),
    library: doc.library,
    templateMapping: doc.templateMapping,
    acceptedDuplicates: doc.acceptedDuplicates,
    nextItemSeq: doc.nextItemSeq,
  };
}

/**
 * Returns the entities in `order`, followed by any entity missing from the
 * order (defensive: an entity is never dropped because the order is stale).
 */
export function orderedValues<T extends { id: string }>(
  record: EntityRecord<T>,
  order: readonly string[],
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const entity = record[id];
    if (entity && !seen.has(id)) {
      out.push(entity);
      seen.add(id);
    }
  }
  for (const entity of Object.values(record)) {
    if (!seen.has(entity.id)) out.push(entity);
  }
  return out;
}
