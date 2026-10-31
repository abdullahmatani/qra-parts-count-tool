/**
 * Sizes from the line numbers on a drawing (CNT-01), for the symbols the
 * assist finds and for counted items with no size yet. The drawing's text is
 * read for line numbers and size labels, and its line work, as the auto trace
 * reads it, says which line each symbol is on (domain/markup/line-sizes.ts).
 * A symbol whose line size cannot be read is given none: it stays pending for
 * the user, and is flagged as incomplete until they enter it.
 */
import { isInline, sizeLabels, sizeSourceOf, type SizeLabel } from '@/domain/line-labels';
import type { TraceBarrier } from '@/domain/markup/auto-trace';
import type { LineSizeReading } from '@/domain/markup/line-sizes';
import { barrierShape } from '@/domain/markup/trace-boundaries';
import type { ProjectDoc } from '@/domain/model';
import type { CountItem, EquipmentType, Rect } from '@/domain/schema/types';
import type { NominalSize } from '@/domain/sizes';
import { symbolRadius } from '@/domain/symbol-examples';
import { drawingTextBoxes } from '@/features/search/drawing-text';
import { runOnSheet, traceScale } from '@/features/trace/auto-trace-actions';
import { getWorkingDirectory } from '@/services/session';
import { useProjectStore } from '@/store/project-store';

/** The label a size was read from, in drawing coordinates. */
export interface SizeSource {
  text: string;
  size: NominalSize;
  rect: Rect;
}

export type LineSize =
  | { status: 'found'; size: NominalSize; source: SizeSource }
  /** Labels on the symbol's line that disagree, nearest first. */
  | { status: 'conflict'; sources: SizeSource[] }
  | { status: 'none' };

/** A symbol to size: a circle in drawing coordinates, and the type it counts as. */
export interface SymbolToSize {
  id: string;
  cx: number;
  cy: number;
  r: number;
  typeId: string | null;
}

function typeOf(
  types: ReadonlyMap<string, EquipmentType>,
  typeId: string | null | undefined,
): EquipmentType | undefined {
  return typeId ? types.get(typeId) : undefined;
}

/**
 * The markers on a drawing the line runs into, as barriers: each symbol's own
 * line work is cut out of the line, so a walk along the line steps across it.
 */
function markerBarriers(
  doc: ProjectDoc,
  drawingId: string,
  skip: ReadonlySet<string>,
  types: ReadonlyMap<string, EquipmentType>,
  scale: number,
): { barriers: TraceBarrier[]; inline: string[] } {
  const items = new Map<string, CountItem>();
  for (const item of Object.values(doc.items)) items.set(item.markerId, item);
  const barriers: TraceBarrier[] = [];
  const inline: string[] = [];
  for (const marker of Object.values(doc.markers)) {
    if (marker.drawingId !== drawingId || skip.has(marker.id)) continue;
    const boundary = marker.esdv !== null || marker.endFlange !== null;
    if (marker.shape !== 'circle' && !boundary) continue;
    const geometry =
      marker.geometry.type === 'circle'
        ? { ...marker.geometry, r: symbolRadius(marker) }
        : marker.geometry;
    const shape = barrierShape(geometry, scale);
    if (!shape) continue;
    barriers.push({ id: marker.id, shape });
    if (boundary || isInline(typeOf(types, items.get(marker.id)?.equipmentTypeId))) {
      inline.push(marker.id);
    }
  }
  return { barriers, inline };
}

const scaled = (label: SizeLabel, scale: number): SizeLabel => ({
  ...label,
  x: label.x * scale,
  y: label.y * scale,
  width: label.width * scale,
  height: label.height * scale,
});

const sourceOf = (label: SizeLabel, scale: number): SizeSource => ({
  text: label.text,
  size: label.size,
  rect: {
    x: label.x / scale,
    y: label.y / scale,
    width: label.width / scale,
    height: label.height / scale,
  },
});

function toLineSize(reading: LineSizeReading, scale: number): LineSize {
  if (reading.status === 'found') {
    return { status: 'found', size: reading.size, source: sourceOf(reading.label, scale) };
  }
  if (reading.status === 'conflict') {
    return { status: 'conflict', sources: reading.labels.map((l) => sourceOf(l, scale)) };
  }
  return { status: 'none' };
}

/**
 * The size of each symbol from the drawing's line numbers. Symbols whose type
 * needs no size are left out of the result; the others are found, in conflict
 * or not found (`none`), and only a found size should be used.
 */
export async function readSymbolSizes(
  drawingId: string,
  symbols: readonly SymbolToSize[],
): Promise<Map<string, LineSize>> {
  const out = new Map<string, LineSize>();
  const doc = useProjectStore.getState().doc;
  const dir = getWorkingDirectory();
  const drawing = doc?.drawings[drawingId];
  if (!doc || !dir || !drawing) return out;
  const types = new Map(doc.library.equipmentTypes.map((t) => [t.id, t]));
  const wanted = symbols.filter((s) => sizeSourceOf(typeOf(types, s.typeId)) !== null);
  if (wanted.length === 0) return out;

  const boxes = await drawingTextBoxes(dir, drawing).catch(() => []);
  const labels = sizeLabels(boxes, doc.settings.units.size);
  if (labels.length === 0) {
    // A sheet with no line numbers (or no text, as a scan) sizes nothing.
    for (const s of wanted) out.set(s.id, { status: 'none' });
    return out;
  }

  const scale = traceScale(drawing.size);
  const ids = new Set(wanted.map((s) => s.id));
  const { barriers, inline } = markerBarriers(doc, drawingId, ids, types, scale);
  const ownOnly: string[] = [];
  for (const s of wanted) {
    barriers.push({
      id: s.id,
      shape: { type: 'disc', cx: s.cx * scale, cy: s.cy * scale, r: s.r * scale },
    });
    const type = typeOf(types, s.typeId);
    if (isInline(type)) inline.push(s.id);
    if (sizeSourceOf(type) === 'own') ownOnly.push(s.id);
  }
  const result = await runOnSheet(
    drawing,
    scale,
    barriers,
    {
      kind: 'sizes',
      labels: labels.map((l) => scaled(l, scale)),
      symbols: [...ids],
      inline,
      ownOnly,
    },
    0,
  );
  for (const [id, reading] of result.sizes ?? []) out.set(id, toLineSize(reading, scale));
  return out;
}
