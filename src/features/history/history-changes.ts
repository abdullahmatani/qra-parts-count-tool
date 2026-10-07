/**
 * What the steps of the undo history change, read from their patches (PRJ-09):
 * a short summary of each step for the history menus, and a preview of what
 * undoing or redoing up to a step would change, so the drawing can grey out
 * the markers concerned before the user commits to it.
 */
import { applyPatches, type Patch } from 'immer';
import { drawingDisplayName } from '@/domain/drawings';
import type { ProjectDoc } from '@/domain/model';
import type { Drawing, Marker } from '@/domain/schema/types';
import type { HistoryEntry } from '@/store/project-store';

export const ENTITY_KINDS = ['drawings', 'segments', 'markers', 'items', 'notes', 'links'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Parts of the project outside the entity collections that a step can change. */
export type ProjectArea =
  | 'project'
  | 'settings'
  | 'stage'
  | 'library'
  | 'template'
  | 'duplicates'
  | 'drawingOrder'
  | 'segmentOrder';

/** Bookkeeping fields (ids, timestamps, counters) are left out of summaries. */
const AREA_OF: Partial<Record<keyof ProjectDoc, ProjectArea>> = {
  name: 'project',
  client: 'project',
  facility: 'project',
  studyRef: 'project',
  description: 'project',
  countRevision: 'project',
  settings: 'settings',
  stage: 'stage',
  library: 'library',
  templateMapping: 'template',
  acceptedDuplicates: 'duplicates',
  drawingOrder: 'drawingOrder',
  segmentOrder: 'segmentOrder',
};

const AREA_ORDER: readonly ProjectArea[] = [
  'project',
  'settings',
  'stage',
  'library',
  'template',
  'duplicates',
  'drawingOrder',
  'segmentOrder',
];

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface StepSummary {
  /** How many entities of each collection the step adds, removes or changes. */
  counts: Record<ChangeKind, Partial<Record<EntityKind, number>>>;
  /** Other parts of the project the step changes, in a fixed order. */
  areas: ProjectArea[];
  /** Names of the drawings the step changes, or changes markers, items or links on. */
  drawings: string[];
}

function isEntityKind(key: unknown): key is EntityKind {
  return (ENTITY_KINDS as readonly unknown[]).includes(key);
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** The drawing an entity sits on, when it has one. */
function drawingOf(kind: EntityKind, id: string, entity: unknown): string | undefined {
  if (kind === 'drawings') return id;
  if (!entity || typeof entity !== 'object') return undefined;
  const fields = entity as Record<string, unknown>;
  const drawingId = kind === 'links' ? fields.sourceDrawingId : fields.drawingId;
  return typeof drawingId === 'string' ? drawingId : undefined;
}

interface Touch {
  /** First and last operation on the entity itself (not one of its fields). */
  first?: Patch['op'];
  last?: Patch['op'];
  /** The entity as one of the patches holds it. */
  value?: unknown;
}

/** Summarises one step of the history. `doc` resolves entities the patches only edit. */
export function summarizeStep(entry: HistoryEntry, doc: ProjectDoc): StepSummary {
  const touched = new Map<EntityKind, Map<string, Touch>>(ENTITY_KINDS.map((k) => [k, new Map()]));
  const areas = new Set<ProjectArea>();
  const touch = (kind: EntityKind, id: string) => {
    const map = touched.get(kind)!;
    let found = map.get(id);
    if (!found) map.set(id, (found = {}));
    return found;
  };

  // A field given an equal value (an order array copied, say) has not changed.
  const before = new Map(
    entry.inverse
      .filter((patch) => !isEntityKind(patch.path[0]))
      .map((patch) => [JSON.stringify(patch.path), patch.value]),
  );
  const record = (patch: Patch, forward: boolean) => {
    const [key, id] = patch.path;
    if (!isEntityKind(key)) {
      const area = AREA_OF[key as keyof ProjectDoc];
      const unchanged =
        patch.op === 'replace' && same(patch.value, before.get(JSON.stringify(patch.path)));
      if (area && forward && !unchanged) areas.add(area);
      return;
    }
    // No command replaces a whole collection; such a step is not broken down.
    if (id === undefined) return;
    const found = touch(key, String(id));
    if (patch.path.length === 2) {
      if (forward) {
        found.first ??= patch.op;
        found.last = patch.op;
      }
      if (patch.op !== 'remove') found.value ??= patch.value;
    }
  };
  for (const patch of entry.patches) record(patch, true);
  // The inverse holds the entities as they were, for removed and edited ones.
  for (const patch of entry.inverse) record(patch, false);

  const counts: StepSummary['counts'] = { added: {}, removed: {}, changed: {} };
  const drawingIds = new Set<string>();
  for (const [kind, map] of touched) {
    for (const [id, found] of map) {
      const before = found.first !== 'add';
      const after = found.last !== 'remove';
      if (!before && !after) continue;
      const change: ChangeKind = !before ? 'added' : !after ? 'removed' : 'changed';
      counts[change][kind] = (counts[change][kind] ?? 0) + 1;
      const drawingId = drawingOf(kind, id, found.value ?? doc[kind][id]);
      if (drawingId) drawingIds.add(drawingId);
    }
  }
  // A drawing the step deletes is only in its patches.
  const drawings = [...drawingIds].flatMap((id) => {
    const drawing = (doc.drawings[id] ?? touched.get('drawings')!.get(id)?.value) as
      Drawing | undefined;
    return drawing ? [drawingDisplayName(drawing)] : [];
  });
  return { counts, areas: AREA_ORDER.filter((area) => areas.has(area)), drawings };
}

export type HistoryDirection = 'undo' | 'redo';

export interface HistoryPreview {
  direction: HistoryDirection;
  /** Number of steps previewed. */
  steps: number;
  /** Markers shown now that the steps change or take away: greyed out on the drawing. */
  changing: ReadonlySet<string>;
  /** Markers as the steps leave them, where they come back or change shape. */
  ghosts: readonly Marker[];
  /** Segments and drawings shown now that the steps change or take away. */
  segments: ReadonlySet<string>;
  drawings: ReadonlySet<string>;
}

/**
 * Previews undoing or redoing the first steps of a history list. `steps` are
 * in the order they would run: for undo the most recent first, for redo the
 * next one first. Each document reached is kept, so moving along the list
 * only applies the steps not seen yet.
 */
export class HistoryPreviewer {
  private readonly docs: ProjectDoc[];
  private readonly steps: readonly HistoryEntry[];
  private readonly direction: HistoryDirection;
  private readonly touched: Map<EntityKind, Set<string>>[] = [];

  constructor(doc: ProjectDoc, steps: readonly HistoryEntry[], direction: HistoryDirection) {
    this.docs = [doc];
    this.steps = steps;
    this.direction = direction;
  }

  /** The document after the first `count` steps. */
  docAfter(count: number): ProjectDoc {
    const n = Math.min(Math.max(count, 0), this.steps.length);
    while (this.docs.length <= n) {
      const step = this.steps[this.docs.length - 1]!;
      const patches = this.direction === 'undo' ? step.inverse : step.patches;
      this.docs.push(applyPatches(this.docs[this.docs.length - 1]!, patches));
    }
    return this.docs[n]!;
  }

  /** Entity ids the step at `index` touches, by collection. */
  private touchedBy(index: number): Map<EntityKind, Set<string>> {
    let found = this.touched[index];
    if (found) return found;
    found = new Map(ENTITY_KINDS.map((kind) => [kind, new Set<string>()]));
    const before = this.docAfter(index);
    const after = this.docAfter(index + 1);
    for (const { path } of this.steps[index]!.patches) {
      const [key, id] = path;
      if (!isEntityKind(key)) continue;
      const ids = found.get(key)!;
      if (id !== undefined) {
        ids.add(String(id));
        continue;
      }
      for (const entityId of new Set([...Object.keys(before[key]), ...Object.keys(after[key])])) {
        if (before[key][entityId] !== after[key][entityId]) ids.add(entityId);
      }
    }
    this.touched[index] = found;
    return found;
  }

  preview(count: number): HistoryPreview {
    const n = Math.min(Math.max(count, 0), this.steps.length);
    const now = this.docs[0]!;
    const then = this.docAfter(n);
    const ids = new Map(ENTITY_KINDS.map((kind) => [kind, new Set<string>()]));
    for (let i = 0; i < n; i += 1) {
      for (const [kind, set] of this.touchedBy(i)) for (const id of set) ids.get(kind)!.add(id);
    }

    // An item edit changes its marker's label, so the marker counts as changing.
    const itemMarkers = new Set<string>();
    for (const id of ids.get('items')!) {
      const a = now.items[id];
      const b = then.items[id];
      if (same(a, b)) continue;
      if (a) itemMarkers.add(a.markerId);
      if (b) itemMarkers.add(b.markerId);
    }

    const changing = new Set<string>();
    const ghosts: Marker[] = [];
    for (const id of new Set([...ids.get('markers')!, ...itemMarkers])) {
      const a = now.markers[id];
      const b = then.markers[id];
      if (a && (itemMarkers.has(id) || !same(a, b))) changing.add(id);
      if (b && (!a || !same(a.geometry, b.geometry))) ghosts.push(b);
    }

    const changed = (kind: 'segments' | 'drawings') =>
      new Set(
        [...ids.get(kind)!].filter((id) => now[kind][id] && !same(now[kind][id], then[kind][id])),
      );

    return {
      direction: this.direction,
      steps: n,
      changing,
      ghosts,
      segments: changed('segments'),
      drawings: changed('drawings'),
    };
  }
}
