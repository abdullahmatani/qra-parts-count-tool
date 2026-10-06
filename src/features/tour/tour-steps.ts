/**
 * The guided tour (onboarding): one complete parts count on the practice
 * project, step by step, through most of the app's tools. Each step says what
 * to do (its text is in the catalogue under `tour.steps.<id>`), where to look
 * (an element to outline, and spots on a sheet), and how to tell it is done,
 * from the project and the interface state. Steps without a check are read
 * and moved on from with Next.
 */
import type { ProjectDoc } from '@/domain/model';
import type { EquipmentCategory, ProjectStage } from '@/domain/schema/types';
import type { HelpTarget } from '@/features/help/help-topics';
import type en from '@/i18n/locales/en.json';
import type { Tool } from '@/store/ui-store';

/** A step's id names its title and text in the catalogue (`tour.steps.<id>`). */
export type TourStepId = keyof (typeof en)['tour']['steps'];

/** The two sheets of the practice project. */
export type TourSheet = 'PEFS-S-001' | 'PEFS-S-002';

/** A place on a sheet to point at, in drawing coordinates: a ring or a box. */
export type TourSpot =
  { x: number; y: number; r: number } | { x: number; y: number; width: number; height: number };

export interface TourContext {
  doc: ProjectDoc;
  activeDrawingId: string | null;
  tool: Tool;
  itemDefaults: { equipmentTypeId: string | null; actuation: string | null };
  highlighted: readonly string[];
  findQuery: string;
  lastExportFolder: string | null;
  /** Drawings shown since the step began. */
  visited: readonly string[];
}

export interface TourStep {
  id: TourStepId;
  /** The stage the step is done in, when it matters. */
  stage?: ProjectStage;
  /** Elements to outline, the first one on screen wins. */
  targets?: string[];
  /** Spots on a sheet to ring, and to zoom to with "Show me". */
  spots?: { sheet: TourSheet; at: TourSpot[] };
  /** Whether the user has done what the step asks. */
  done?: (ctx: TourContext) => boolean;
  /** The documentation about the step. */
  help: HelpTarget;
}

export function sheetId(doc: ProjectDoc, sheet: TourSheet): string | null {
  return doc.drawingOrder.find((id) => doc.drawings[id]?.drawingNo === sheet) ?? null;
}

const markers = (doc: ProjectDoc) => Object.values(doc.markers);
const items = (doc: ProjectDoc) => Object.values(doc.items);

function categoryOf(doc: ProjectDoc, typeId: string | null): EquipmentCategory | null {
  return doc.library.equipmentTypes.find((type) => type.id === typeId)?.category ?? null;
}

function itemsOf(doc: ProjectDoc, category: EquipmentCategory, sized = false) {
  return items(doc).filter(
    (item) =>
      categoryOf(doc, item.equipmentTypeId) === category && (!sized || item.nominalSize !== null),
  );
}

const esdvs = (doc: ProjectDoc) => markers(doc).filter((marker) => marker.esdv);
const esdvsInSegments = (doc: ProjectDoc) =>
  esdvs(doc).filter((marker) => marker.esdv!.upstreamSegmentId || marker.esdv!.downstreamSegmentId);

export const TOUR_STEPS: TourStep[] = [
  { id: 'welcome', help: { articleId: 'guided-tour' } },
  {
    id: 'openDrawing',
    targets: ['[data-testid="drawing-list"]'],
    done: ({ doc, activeDrawingId }) => activeDrawingId === sheetId(doc, 'PEFS-S-001'),
    help: { articleId: 'drawings', sectionId: 'the-drawing-list' },
  },
  {
    id: 'navigate',
    targets: ['[data-testid="viewer-controls"]', '[data-testid="canvas-area"]'],
    help: { articleId: 'viewing-drawings', sectionId: 'zoom-and-pan' },
  },
  {
    id: 'findText',
    targets: ['[data-testid="find-bar"]', '[data-tour="find"]'],
    done: ({ findQuery }) => findQuery.toLowerCase().replace(/[\s-]/g, '').includes('esdv'),
    help: { articleId: 'viewing-drawings', sectionId: 'find-text' },
  },
  {
    id: 'createSegment',
    stage: 'segments',
    targets: ['[data-tour="add-segment"]'],
    done: ({ doc }) => doc.segmentOrder.length > 0,
    help: { articleId: 'segments', sectionId: 'create-a-segment' },
  },
  {
    id: 'esdv',
    stage: 'segments',
    targets: ['[data-tour="tool-esdv"]'],
    spots: { sheet: 'PEFS-S-001', at: [{ x: 150, y: 290, r: 34 }] },
    done: ({ doc }) => esdvs(doc).length > 0,
    help: { articleId: 'segments', sectionId: 'mark-esdvs' },
  },
  {
    id: 'esdvSegments',
    stage: 'segments',
    targets: ['[data-testid="esdv-editor"]', '[data-testid="right-pane"]'],
    done: ({ doc }) => esdvsInSegments(doc).length > 0,
    help: { articleId: 'segments', sectionId: 'mark-esdvs' },
  },
  {
    id: 'moreEsdvs',
    stage: 'segments',
    targets: ['[data-tour="tool-esdv"]'],
    spots: {
      sheet: 'PEFS-S-001',
      at: [
        { x: 920, y: 140, r: 34 },
        { x: 950, y: 550, r: 34 },
      ],
    },
    done: ({ doc }) => esdvsInSegments(doc).length >= 3,
    help: { articleId: 'segments', sectionId: 'mark-esdvs' },
  },
  {
    id: 'endFlange',
    stage: 'segments',
    targets: ['[data-tour="tool-endFlange"]'],
    spots: { sheet: 'PEFS-S-001', at: [{ x: 620, y: 478, r: 22 }] },
    done: ({ doc }) => markers(doc).some((marker) => marker.endFlange),
    help: { articleId: 'segments', sectionId: 'mark-end-flanges' },
  },
  {
    id: 'links',
    stage: 'segments',
    targets: ['[data-tour="project-menu"]'],
    spots: { sheet: 'PEFS-S-001', at: [{ x: 1040, y: 137, width: 120, height: 26 }] },
    done: ({ doc }) => Object.values(doc.links).some((link) => link.targetDrawingId),
    help: { articleId: 'notes-and-links', sectionId: 'suggest-drawing-links' },
  },
  {
    id: 'autoTrace',
    stage: 'segments',
    targets: ['[data-testid="auto-trace"]', '[data-tour="tool-highlighter"]'],
    done: ({ doc }) =>
      markers(doc).some((marker) => marker.shape === 'highlighter' && marker.segmentId),
    help: { articleId: 'highlighting', sectionId: 'auto-trace' },
  },
  {
    id: 'dashed',
    stage: 'segments',
    targets: ['[data-tour="tool-dashed"]'],
    spots: { sheet: 'PEFS-S-001', at: [{ x: 460, y: 225, width: 320, height: 150 }] },
    done: ({ doc }) => markers(doc).some((marker) => marker.shape === 'dashedHighlight'),
    help: { articleId: 'highlighting', sectionId: 'dashed-highlight' },
  },
  {
    id: 'followLink',
    targets: ['[data-tour="back"]', '[data-tour="tool-select"]'],
    spots: { sheet: 'PEFS-S-001', at: [{ x: 1040, y: 137, width: 120, height: 26 }] },
    done: ({ doc, activeDrawingId, visited }) => {
      const first = sheetId(doc, 'PEFS-S-001');
      const second = sheetId(doc, 'PEFS-S-002');
      return !!second && visited.includes(second) && activeDrawingId === first;
    },
    help: { articleId: 'notes-and-links', sectionId: 'follow-a-link' },
  },
  {
    id: 'startCount',
    targets: ['[data-testid="stage-switcher"]'],
    done: ({ doc }) => doc.stage === 'count',
    help: { articleId: 'counting', sectionId: 'start-the-count' },
  },
  {
    id: 'equipmentBar',
    stage: 'count',
    targets: ['[data-testid="equipment-bar"]'],
    done: ({ doc, itemDefaults }) =>
      categoryOf(doc, itemDefaults.equipmentTypeId) === 'valve' &&
      itemDefaults.actuation === 'manual',
    help: { articleId: 'counting', sectionId: 'the-equipment-bar' },
  },
  {
    id: 'circleValve',
    stage: 'count',
    targets: ['[data-testid="item-editor"]', '[data-tour="tool-circle"]'],
    spots: { sheet: 'PEFS-S-001', at: [{ x: 280, y: 300, r: 24 }] },
    done: ({ doc }) => itemsOf(doc, 'valve', true).length > 0,
    help: { articleId: 'counting', sectionId: 'count-an-item' },
  },
  {
    id: 'stamp',
    stage: 'count',
    targets: ['[data-tour="tool-stamp"]'],
    spots: {
      sheet: 'PEFS-S-001',
      at: [
        { x: 220, y: 300, r: 20 },
        { x: 340, y: 300, r: 20 },
      ],
    },
    done: ({ doc }) => itemsOf(doc, 'flange', true).length >= 2,
    help: { articleId: 'counting', sectionId: 'stamp' },
  },
  {
    id: 'findSimilar',
    stage: 'count',
    targets: [
      '[data-testid="suggestion-bar"]',
      '[data-tour="find-similar"]',
      '[data-tour="tool-select"]',
    ],
    spots: {
      sheet: 'PEFS-S-001',
      at: [
        { x: 790, y: 150, r: 24 },
        { x: 640, y: 560, r: 24 },
        { x: 620, y: 420, r: 24 },
        { x: 860, y: 560, r: 24 },
      ],
    },
    done: ({ doc }) => itemsOf(doc, 'valve').length >= 3,
    help: { articleId: 'counting', sectionId: 'find-similar-symbols' },
  },
  {
    id: 'sizes',
    stage: 'count',
    targets: ['[data-testid="item-editor"]', '[data-testid="marker-inspector"]'],
    done: ({ doc }) =>
      new Set(itemsOf(doc, 'valve', true).map((item) => item.nominalSize)).size >= 2,
    help: { articleId: 'counting', sectionId: 'editing-markers' },
  },
  {
    id: 'countTable',
    stage: 'count',
    targets: ['[data-testid="count-table"]'],
    done: ({ highlighted }) => highlighted.length > 0,
    help: { articleId: 'counting', sectionId: 'the-count-table' },
  },
  {
    id: 'finishCount',
    stage: 'count',
    targets: ['[data-testid="equipment-bar"]'],
    spots: {
      sheet: 'PEFS-S-001',
      at: [
        { x: 400, y: 252, r: 26 },
        { x: 776, y: 400, r: 26 },
        { x: 615, y: 300, r: 60 },
        { x: 760, y: 560, r: 34 },
        { x: 850, y: 150, r: 20 },
      ],
    },
    help: { articleId: 'counting', sectionId: 'warnings' },
  },
  {
    id: 'note',
    targets: ['[data-testid="notes-panel"]'],
    done: ({ doc }) => Object.keys(doc.notes).length > 0,
    help: { articleId: 'notes-and-links', sectionId: 'segment-notes' },
  },
  {
    id: 'status',
    stage: 'count',
    targets: ['[data-testid="segment-count-panel"]'],
    done: ({ doc }) =>
      Object.values(doc.segments).some(
        (segment) => segment.status === 'counted' || segment.status === 'checked',
      ),
    help: { articleId: 'segments', sectionId: 'status' },
  },
  {
    id: 'export',
    targets: ['[data-tour="export"]'],
    done: ({ lastExportFolder }) => lastExportFolder !== null,
    help: { articleId: 'export' },
  },
  { id: 'finish', help: { articleId: 'excel-template' } },
];

/** The box round a step's spots, with room round it, for "Show me". */
export function spotsBox(spots: readonly TourSpot[], margin = 120) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const spot of spots) {
    const [x0, y0, x1, y1] =
      'r' in spot
        ? [spot.x - spot.r, spot.y - spot.r, spot.x + spot.r, spot.y + spot.r]
        : [spot.x, spot.y, spot.x + spot.width, spot.y + spot.height];
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}
