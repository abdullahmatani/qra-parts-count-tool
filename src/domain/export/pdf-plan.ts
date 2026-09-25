/**
 * Annotated PDF plan (EXP-03, EXP-05): which PDFs to write, what each page
 * shows and what the files are called. Pure, so it is tested without pdf-lib;
 * the writer only draws what the plan says. Drawing links are never part of
 * an overlay (LNK-04).
 */
import { markerWarningMap, type CountDoc, type CountEntry } from '../count/count';
import { itemsByMarker, markerLabel, markerPaint, markerSegmentIds } from '../markup/presentation';
import type { ProjectDoc } from '../model';
import { ESDV_COLOUR, MARKER_WARNING, UNASSIGNED_COLOUR, segmentAppearance } from '../palette';
import type { Drawing, Marker, MarkerGeometry, MarkerSymbol, Point } from '../schema/types';
import { formatExportName, uniqueName } from './file-names';

export interface OverlayMarker {
  geometry: MarkerGeometry;
  /** How a circle is drawn, as on screen (ring, dot, square or free-form outline). */
  symbol: MarkerSymbol;
  outline: readonly Point[] | null;
  colour: string;
  dash: readonly number[];
  label: string;
  esdv: boolean;
  warning: boolean;
}

export interface LegendEntry {
  label: string;
  colour: string;
  dash: readonly number[];
  kind: 'circle' | 'esdv' | 'warning';
}

export interface Overlay {
  markers: OverlayMarker[];
  legendTitle: string;
  legend: LegendEntry[];
  /** Stamp lines: project, drawing, count revision, date (EXP-03). */
  stamp: string[];
}

export interface PlannedPage {
  drawingId: string;
  overlay: Overlay;
}

export interface PlannedPdf {
  fileName: string;
  /** One drawing, or all drawings of one segment. */
  kind: 'drawing' | 'segment';
  segmentId: string | null;
  title: string;
  pages: PlannedPage[];
}

export interface PdfLabels {
  legendTitle: string;
  esdv: string;
  unassigned: string;
  warning: string;
  /** "PEFS-1001 rev B, sheet 2". */
  drawing: (drawing: Drawing) => string;
  segment: (label: string) => string;
  countRevision: (revision: string) => string;
  exported: (date: string) => string;
}

export interface PdfPlanInput {
  doc: CountDoc &
    Pick<
      ProjectDoc,
      'name' | 'studyRef' | 'countRevision' | 'drawings' | 'drawingOrder' | 'segmentOrder'
    >;
  entries: readonly CountEntry[];
  /** One annotated PDF per drawing. */
  drawings: boolean;
  /** One combined PDF per segment (`<segment>_drawings.pdf`). */
  segments: boolean;
  now: Date;
  labels: PdfLabels;
  /** File names already used in the export folder (lower case); updated. */
  taken?: Set<string>;
}

/** Local calendar date, `2026-09-23`: unambiguous on an engineering record. */
export function stampDate(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The drawing number, or the file name without its extension when there is none. */
export function drawingName(drawing: Drawing): string {
  if (drawing.drawingNo.trim()) return drawing.drawingNo.trim();
  const file = drawing.originalFileName || drawing.fileName;
  return file.replace(/\.[^.]+$/, '');
}

function isArea(marker: Marker): boolean {
  return marker.geometry.type !== 'circle';
}

export function planPdfExport(input: PdfPlanInput): PlannedPdf[] {
  const { doc, entries, labels, now } = input;
  const taken = input.taken ?? new Set<string>();
  const warnings = markerWarningMap(doc, entries);
  const items = itemsByMarker(doc.items);
  const segmentRank = new Map(doc.segmentOrder.map((id, i) => [id, i]));

  const byDrawing = new Map<string, Marker[]>();
  for (const marker of Object.values(doc.markers)) {
    const list = byDrawing.get(marker.drawingId) ?? [];
    list.push(marker);
    byDrawing.set(marker.drawingId, list);
  }

  const overlay = (drawing: Drawing, markers: Marker[], segmentLabel: string | null): Overlay => {
    // Areas and runs first, so circles stay on top (as on screen).
    const ordered = [...markers.filter(isArea), ...markers.filter((m) => !isArea(m))];
    const legend: LegendEntry[] = [];
    const segmentIds = new Set<string>();
    let esdv = false;
    let unassigned = false;
    let warning = false;
    const out = ordered.map((marker): OverlayMarker => {
      const paint = markerPaint(marker, doc.segments);
      const flagged = warnings.has(marker.id);
      if (marker.esdv) esdv = true;
      else if (marker.segmentId && doc.segments[marker.segmentId]) segmentIds.add(marker.segmentId);
      else unassigned = true;
      if (flagged) warning = true;
      return {
        geometry: marker.geometry,
        symbol: marker.style.symbol,
        outline: marker.style.outline,
        colour: paint.colour,
        dash: paint.dash,
        label: markerLabel(marker, items.get(marker.id)),
        esdv: marker.esdv !== null,
        warning: flagged,
      };
    });
    for (const id of [...segmentIds].sort(
      (a, b) => (segmentRank.get(a) ?? 0) - (segmentRank.get(b) ?? 0),
    )) {
      const segment = doc.segments[id]!;
      const appearance = segmentAppearance(segment.colour);
      const detail = [segment.fluid, segment.description].find((s) => s.trim()) ?? '';
      legend.push({
        label: detail ? `${segment.label} – ${detail}` : segment.label,
        colour: appearance.hex,
        dash: appearance.dash,
        kind: 'circle',
      });
    }
    if (esdv) legend.push({ label: labels.esdv, colour: ESDV_COLOUR, dash: [], kind: 'esdv' });
    if (unassigned) {
      legend.push({
        label: labels.unassigned,
        colour: UNASSIGNED_COLOUR,
        dash: [],
        kind: 'circle',
      });
    }
    if (warning) {
      legend.push({ label: labels.warning, colour: MARKER_WARNING, dash: [], kind: 'warning' });
    }
    const project = [doc.name, doc.studyRef].filter((s) => s.trim()).join(' · ');
    return {
      markers: out,
      legendTitle: labels.legendTitle,
      legend,
      stamp: [
        project,
        labels.drawing(drawing),
        ...(segmentLabel ? [labels.segment(segmentLabel)] : []),
        labels.countRevision(doc.countRevision),
        labels.exported(stampDate(now)),
      ],
    };
  };

  const drawings = doc.drawingOrder.map((id) => doc.drawings[id]).filter((d) => d !== undefined);
  const plans: PlannedPdf[] = [];

  if (input.drawings) {
    for (const drawing of drawings) {
      const markers = byDrawing.get(drawing.id) ?? [];
      const segmentLabels = [...new Set(markers.flatMap((m) => markerSegmentIds(m)))]
        .filter((id) => doc.segments[id])
        .sort((a, b) => (segmentRank.get(a) ?? 0) - (segmentRank.get(b) ?? 0))
        .map((id) => doc.segments[id]!.label);
      const name = formatExportName(doc.settings.exportFilenamePattern, {
        project: doc.name,
        segment: segmentLabels.join('+'),
        drawingNo: drawingName(drawing),
        rev: drawing.revision,
        sheet: drawing.sheet,
        title: drawing.title,
        page: drawing.page ? String(drawing.page) : '',
      });
      plans.push({
        fileName: uniqueName(name, '.pdf', taken),
        kind: 'drawing',
        segmentId: null,
        title: [drawingName(drawing), drawing.title].filter(Boolean).join(' – '),
        pages: [{ drawingId: drawing.id, overlay: overlay(drawing, markers, null) }],
      });
    }
  }

  if (input.segments) {
    for (const segmentId of doc.segmentOrder) {
      const segment = doc.segments[segmentId];
      if (!segment) continue;
      const pages: PlannedPage[] = [];
      for (const drawing of drawings) {
        const markers = (byDrawing.get(drawing.id) ?? []).filter((m) =>
          markerSegmentIds(m).includes(segmentId),
        );
        if (!markers.length && !segment.drawingIds.includes(drawing.id)) continue;
        pages.push({ drawingId: drawing.id, overlay: overlay(drawing, markers, segment.label) });
      }
      if (!pages.length) continue;
      const name = formatExportName('{segment}_drawings', { segment: segment.label });
      plans.push({
        fileName: uniqueName(name, '.pdf', taken),
        kind: 'segment',
        segmentId,
        title: segment.label,
        pages,
      });
    }
  }
  return plans;
}
