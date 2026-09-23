import { createProject } from '@/domain/schema/factory';
import type {
  CountItem,
  Drawing,
  Marker,
  Note,
  Project,
  ProjectSettings,
  Segment,
} from '@/domain/schema/types';
import { newId } from '@/lib/ids';

export const FIXED_NOW = new Date('2026-09-23T10:00:00.000Z');
export const ZERO_HASH = '0'.repeat(64);

export function makeSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    esdvBoundaryRule: 'upstream',
    flangeConvention: 'perJoint',
    pipeLengthCounting: false,
    units: { size: 'in', pressure: 'barg', temperature: '°C', length: 'm' },
    exportFilenamePattern: '{drawingNo}_{rev}_annotated',
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  const project = createProject(
    { name: 'Test project', client: 'Client', facility: 'Plant A', settings: makeSettings() },
    FIXED_NOW,
  );
  return { ...project, ...overrides };
}

export function makeDrawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: newId('drw'),
    fileName: 'PEFS-001.pdf',
    originalFileName: 'PEFS-001.pdf',
    fileHash: ZERO_HASH,
    fileType: 'pdf',
    page: 1,
    layout: null,
    isCadPlot: false,
    drawingNo: 'PEFS-001',
    sheet: '1',
    title: 'Inlet separator',
    revision: 'A',
    size: { width: 2384, height: 1684 },
    importedAt: FIXED_NOW.toISOString(),
    needsReview: false,
    ...overrides,
  };
}

export function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: newId('seg'),
    label: 'IS-01',
    description: '',
    colour: 1,
    fluid: '',
    phase: '',
    pressure: null,
    temperature: null,
    status: 'notStarted',
    boundingEsdvIds: [],
    drawingIds: [],
    countedBy: '',
    checkedBy: '',
    ...overrides,
  };
}

export function makeCircleMarker(drawingId: string, overrides: Partial<Marker> = {}): Marker {
  return {
    id: newId('mkr'),
    drawingId,
    segmentId: null,
    shape: 'circle',
    geometry: { type: 'circle', cx: 100, cy: 100, r: 12 },
    style: { labelOffset: null },
    esdv: null,
    ...overrides,
  };
}

export function makeItem(
  marker: Marker,
  seq: number,
  overrides: Partial<CountItem> = {},
): CountItem {
  return {
    id: newId('itm'),
    seq,
    markerId: marker.id,
    segmentId: marker.segmentId,
    drawingId: marker.drawingId,
    equipmentTypeId: null,
    nominalSize: null,
    sizeUnit: 'in',
    actuation: null,
    quantity: 1,
    tag: '',
    remarks: '',
    pipeLength: null,
    ...overrides,
  };
}

export function makeNote(segmentId: string, overrides: Partial<Note> = {}): Note {
  return {
    id: 'not_1',
    segmentId,
    author: 'AM',
    timestamp: FIXED_NOW.toISOString(),
    text: 'Assumed all flanges are ANSI 300.',
    markerRef: null,
    ...overrides,
  };
}

/** A small, internally consistent project: one drawing, one segment, two items. */
export function makePopulatedProject(): Project {
  const drawing = makeDrawing();
  const segment = makeSegment({ drawingIds: [drawing.id] });
  const m1 = makeCircleMarker(drawing.id, { segmentId: segment.id });
  const m2 = makeCircleMarker(drawing.id, {
    segmentId: segment.id,
    geometry: { type: 'circle', cx: 300, cy: 200, r: 12 },
  });
  return makeProject({
    drawings: [drawing],
    segments: [segment],
    markers: [m1, m2],
    items: [
      makeItem(m1, 1, { nominalSize: 2, tag: 'HV-1001' }),
      makeItem(m2, 2, { nominalSize: 50, sizeUnit: 'DN' }),
    ],
    nextItemSeq: 3,
  });
}
