/**
 * Builds the sample study's project from the sample layout (roadmap #46),
 * with the same domain actions the app uses, so it is a project any user
 * could have made: two segments, bounding ESDVs, typed and sized items, one
 * item left without a size (to show the pre-export check), a highlighted
 * vessel, a signed note and drawing links between the sheets.
 */
import { addItem, updateItem } from '@/domain/actions/items';
import { addLink, updateLink } from '@/domain/actions/links';
import { addMarker, syncBoundingEsdvs } from '@/domain/actions/markers';
import { addNote } from '@/domain/actions/notes';
import { createSegment } from '@/domain/actions/segments';
import { docToProject, projectToDoc } from '@/domain/model';
import { createProject } from '@/domain/schema';
import type { Drawing, Library, Marker, MarkerGeometry, Project } from '@/domain/schema/types';
import { newId } from '@/lib/ids';
import {
  SAMPLE_SEGMENTS,
  SAMPLE_SHEETS,
  SHEET,
  connectorBox,
  type SampleSymbol,
} from './sample-layout';

export const SAMPLE_FILE = 'PEFS-S-001_002_sample.pdf';

/** Marker radius per symbol kind, so each circle rings its symbol. */
const RADIUS: Record<SampleSymbol['kind'], number> = {
  valve: 16,
  check: 16,
  esdv: 17,
  flange: 12,
  instrument: 21,
  vessel: 30,
  pump: 28,
  filter: 32,
  compressor: 40,
};

export function buildSampleProject(
  library: Library,
  file: { hash: string },
  now: Date,
  appVersion = '',
): Project {
  const project = createProject(
    {
      name: 'Sample study - inlet separator',
      client: 'Example Operating Company',
      facility: 'Example central processing facility',
      studyRef: 'QRA-SAMPLE',
      description:
        'A small marked-up study to try the tool on: two PEFS sheets, two segments, a finished count and one open query.',
      settings: { esdvBoundaryRule: 'upstream', flangeConvention: 'perJoint' },
      library,
      appVersion,
    },
    now,
  );
  const doc = projectToDoc(project);

  const drawingIds = SAMPLE_SHEETS.map((sheet, index) => {
    const drawing: Drawing = {
      id: newId('drw'),
      fileName: SAMPLE_FILE,
      originalFileName: SAMPLE_FILE,
      fileHash: file.hash,
      fileType: 'pdf',
      page: index + 1,
      layout: null,
      isCadPlot: false,
      drawingNo: sheet.drawingNo,
      sheet: sheet.sheet,
      title: sheet.title,
      revision: sheet.revision,
      size: { width: SHEET.width, height: SHEET.height },
      importedAt: now.toISOString(),
      needsReview: false,
    };
    doc.drawings[drawing.id] = drawing;
    doc.drawingOrder.push(drawing.id);
    return drawing.id;
  });

  const segmentIds = new Map<string, string>();
  SAMPLE_SEGMENTS.forEach((segment, i) => {
    segmentIds.set(
      segment.key,
      createSegment(doc, {
        label: segment.key,
        description: segment.description,
        colour: i + 1,
        equipment: segment.equipment,
        streamNumber: segment.streamNumber,
        fluid: segment.fluid,
        phase: segment.phase,
        pressure: segment.pressure,
        temperature: segment.temperature,
        h2sMoleFraction: segment.h2sMoleFraction,
        molecularWeightOrDensity: segment.molecularWeightOrDensity,
        status: segment.status,
        countedBy: segment.countedBy,
      }),
    );
  });
  const segmentOf = (key: string | null | undefined) => (key ? segmentIds.get(key)! : null);
  const typeOf = (category: string) =>
    library.equipmentTypes.find((type) => type.category === category)?.id ?? null;

  let openQuery: string | null = null;
  SAMPLE_SHEETS.forEach((sheet, index) => {
    const drawingId = drawingIds[index]!;
    for (const symbol of sheet.symbols) {
      if (!symbol.item && !symbol.between) continue;
      const geometry: MarkerGeometry = {
        type: 'circle',
        cx: symbol.x,
        cy: symbol.y,
        r: RADIUS[symbol.kind],
      };
      const marker: Marker = {
        id: newId('mkr'),
        drawingId,
        segmentId: symbol.between ? null : segmentOf(symbol.segment),
        shape: 'circle',
        geometry,
        style: { labelOffset: null, symbol: 'circle', outline: null },
        esdv: symbol.between
          ? {
              tag: symbol.tag,
              nominalSize: symbol.esdvSize ?? null,
              sizeUnit: 'in',
              upstreamSegmentId: segmentOf(symbol.between[0]),
              downstreamSegmentId: segmentOf(symbol.between[1]),
              boundaryRuleOverride: null,
            }
          : null,
      };
      addMarker(doc, marker);
      if (symbol.between) {
        // ESDVs link the drawing to the segments on both sides.
        for (const side of symbol.between) {
          const id = segmentOf(side);
          if (id && !doc.segments[id]!.drawingIds.includes(drawingId)) {
            doc.segments[id]!.drawingIds.push(drawingId);
          }
        }
        continue;
      }
      const item = symbol.item!;
      const itemId = addItem(doc, marker.id, {
        equipmentTypeId: typeOf(item.category),
        actuation: item.actuation ?? null,
      })!;
      updateItem(doc, itemId, {
        ...(item.size !== undefined ? { nominalSize: item.size, sizeUnit: 'in' } : {}),
        tag: symbol.showTag === false ? '' : symbol.tag,
        remarks: item.remarks ?? '',
      });
      if (
        item.category !== 'vessel' &&
        item.size === undefined &&
        isSized(library, item.category)
      ) {
        openQuery = marker.id;
      }
    }
  });
  syncBoundingEsdvs(doc);

  // The separator itself, highlighted for IS-01.
  addMarker(doc, {
    id: newId('mkr'),
    drawingId: drawingIds[0]!,
    segmentId: segmentOf('IS-01'),
    shape: 'dashedHighlight',
    geometry: { type: 'rect', x: 455, y: 225, width: 320, height: 150 },
    style: { labelOffset: null, symbol: 'circle', outline: null },
    esdv: null,
  });

  // Off-page connectors link the sheets (LNK-01).
  SAMPLE_SHEETS.forEach((sheet, index) => {
    for (const connector of sheet.connectors) {
      if (connector.to < 0) continue;
      const b = connectorBox(connector);
      const linkId = addLink(doc, drawingIds[index]!, {
        minX: b.x,
        minY: b.y,
        maxX: b.x + b.w,
        maxY: b.y + b.h,
      })!;
      updateLink(doc, linkId, {
        targetDrawingId: drawingIds[connector.to]!,
        label: `Continued on ${SAMPLE_SHEETS[connector.to]!.drawingNo}`,
      });
    }
  });

  const is01 = segmentOf('IS-01')!;
  const is02 = segmentOf('IS-02')!;
  addNote(
    doc,
    {
      segmentId: is01,
      author: 'QRA',
      text: '**Scope**: from ESDV-101 to ESDV-102 and ESDV-103.\n- V-100 counted as one pressure vessel\n- Instrument taps counted as small-bore connections\n- Check valve NRV-101 counted as a manual valve',
    },
    now,
  );
  addNote(
    doc,
    {
      segmentId: is02,
      author: 'QRA',
      text: 'Flange size downstream of HV-201 is not shown on the PEFS. Query raised with the client.',
      markerRef: openQuery,
    },
    now,
  );
  return docToProject(doc);
}

function isSized(library: Library, category: string): boolean {
  return library.equipmentTypes.find((type) => type.category === category)?.sizeRequired ?? false;
}
