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
import type {
  Drawing,
  Marker,
  MarkerGeometry,
  MarkerSymbol,
  Point,
  Segment,
} from '../schema/types';
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
  /** An end flange: its double line geometry is drawn as a solid bar across the pipe. */
  endFlange: boolean;
  warning: boolean;
}

export interface LegendEntry {
  label: string;
  colour: string;
  dash: readonly number[];
  /** The swatch: a ring, an ESDV ring or double line, an end flange bar, or a warning outline. */
  kind: 'circle' | 'esdv' | 'esdvLine' | 'endFlange' | 'warning';
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

/** A bookmark to a page of the PDF (0-based). */
export interface OutlineEntry {
  title: string;
  pageIndex: number;
}

export interface PlannedPdf {
  fileName: string;
  /** One drawing, all drawings of one segment, or every segment's drawings in one file. */
  kind: 'drawing' | 'segment' | 'allSegments';
  segmentId: string | null;
  title: string;
  pages: PlannedPage[];
  /** Bookmarks: one per segment in the all-segments PDF, none otherwise. */
  outline: OutlineEntry[];
}

export interface PdfLabels {
  legendTitle: string;
  esdv: string;
  endFlange: string;
  unassigned: string;
  warning: string;
  /** "PEFS-1001 rev B, sheet 2". */
  drawing: (drawing: Drawing) => string;
  segment: (label: string) => string;
  /** Title of the PDF with every segment in it. */
  allSegments: string;
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
  /** One PDF with every segment's pages, segment by segment (`<project>_all_segments.pdf`). */
  allSegments?: boolean;
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

/** "IS-01 – Gas": the label with the fluid, or the description when there is no fluid. */
function segmentTitle(segment: Segment): string {
  const detail = [segment.fluid, segment.description].find((s) => s.trim()) ?? '';
  return detail ? `${segment.label} – ${detail}` : segment.label;
}

/** Highlights and runs, drawn under the circles, ESDV double lines and end flanges. */
function isArea(marker: Marker): boolean {
  return marker.geometry.type !== 'circle' && marker.geometry.type !== 'doubleLine';
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
    let esdvRing = false;
    let esdvLine = false;
    let endFlange = false;
    let unassigned = false;
    let warning = false;
    const out = ordered.map((marker): OverlayMarker => {
      const paint = markerPaint(marker, doc.segments);
      const flagged = warnings.has(marker.id);
      if (marker.endFlange) endFlange = true;
      if (marker.esdv) {
        if (marker.geometry.type === 'doubleLine') esdvLine = true;
        else esdvRing = true;
      } else if (marker.segmentId && doc.segments[marker.segmentId])
        segmentIds.add(marker.segmentId);
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
        endFlange: marker.endFlange !== null,
        warning: flagged,
      };
    });
    for (const id of [...segmentIds].sort(
      (a, b) => (segmentRank.get(a) ?? 0) - (segmentRank.get(b) ?? 0),
    )) {
      const segment = doc.segments[id]!;
      const appearance = segmentAppearance(segment.colour);
      legend.push({
        label: segmentTitle(segment),
        colour: appearance.hex,
        dash: appearance.dash,
        kind: 'circle',
      });
    }
    if (esdvRing) legend.push({ label: labels.esdv, colour: ESDV_COLOUR, dash: [], kind: 'esdv' });
    if (esdvLine) {
      legend.push({ label: labels.esdv, colour: ESDV_COLOUR, dash: [], kind: 'esdvLine' });
    }
    // End flanges take their segment's colour; the swatch shows the bar.
    if (endFlange) {
      legend.push({
        label: labels.endFlange,
        colour: UNASSIGNED_COLOUR,
        dash: [],
        kind: 'endFlange',
      });
    }
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
        outline: [],
      });
    }
  }

  // Each segment's drawings, with only that segment's markers on them.
  const segmentPages = (segment: Segment): PlannedPage[] =>
    drawings.flatMap((drawing) => {
      const markers = (byDrawing.get(drawing.id) ?? []).filter((m) =>
        markerSegmentIds(m).includes(segment.id),
      );
      if (!markers.length && !segment.drawingIds.includes(drawing.id)) return [];
      return [{ drawingId: drawing.id, overlay: overlay(drawing, markers, segment.label) }];
    });
  const segments = input.segments || input.allSegments ? doc.segmentOrder : [];
  const bySegment = segments
    .map((id) => doc.segments[id])
    .filter((s) => s !== undefined)
    .map((segment) => ({ segment, pages: segmentPages(segment) }))
    .filter(({ pages }) => pages.length > 0);

  if (input.segments) {
    for (const { segment, pages } of bySegment) {
      const name = formatExportName('{segment}_drawings', { segment: segment.label });
      plans.push({
        fileName: uniqueName(name, '.pdf', taken),
        kind: 'segment',
        segmentId: segment.id,
        title: segment.label,
        pages,
        outline: [],
      });
    }
  }

  if (input.allSegments && bySegment.length) {
    const outline: OutlineEntry[] = [];
    const pages: PlannedPage[] = [];
    for (const { segment, pages: own } of bySegment) {
      outline.push({ title: segmentTitle(segment), pageIndex: pages.length });
      pages.push(...own);
    }
    const name = formatExportName('{project}_all_segments', { project: doc.name });
    plans.push({
      fileName: uniqueName(name, '.pdf', taken),
      kind: 'allSegments',
      segmentId: null,
      title: [doc.name.trim(), labels.allSegments].filter(Boolean).join(' – '),
      pages,
      outline,
    });
  }
  return plans;
}
