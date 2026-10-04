import { describe, expect, it } from 'vitest';
import { projectToDoc } from './model';
import { ProjectSchema } from './schema/project-file';
import { docToProject } from './model';
import {
  isEditableInStage,
  isSegmentSetupMarker,
  segmentReadiness,
  stageStartTool,
  stageTools,
} from './stage';
import {
  makeCircleMarker,
  makeDrawing,
  makeProject,
  makeSegment,
  makeSettings,
} from '@/test/fixtures';

const esdvData = (upstream: string | null, downstream: string | null) => ({
  tag: 'ESDV-1',
  nominalSize: 8,
  sizeUnit: 'in' as const,
  upstreamSegmentId: upstream,
  downstreamSegmentId: downstream,
  boundaryRuleOverride: null,
});

describe('study stages', () => {
  it('gives each stage its own tools', () => {
    expect(stageTools('segments', false)).toEqual([
      'select',
      'highlighter',
      'dashed',
      'esdv',
      'endFlange',
      'link',
    ]);
    expect(stageTools('count', false)).toEqual(['select', 'circle', 'stamp']);
    // Line runs carry pipe lengths while counting (CNT-12).
    expect(stageTools('count', true)).toEqual(['select', 'circle', 'stamp', 'dashed']);
    expect(stageStartTool('segments')).toBe('highlighter');
    expect(stageStartTool('count')).toBe('circle');
  });

  it('locks the segment set-up while counting, not the equipment', () => {
    const circle = makeCircleMarker('drw_1');
    const esdv = makeCircleMarker('drw_1', { esdv: esdvData(null, null) });
    const flange = makeCircleMarker('drw_1', {
      shape: 'endFlange',
      geometry: {
        type: 'doubleLine',
        points: [
          [0, 0],
          [0, 10],
        ],
        gap: 2,
      },
      endFlange: { tag: '', destination: 'flare' },
    });
    const stroke = makeCircleMarker('drw_1', {
      shape: 'highlighter',
      geometry: {
        type: 'stroke',
        points: [
          [0, 0],
          [10, 0],
        ],
        width: 4,
      },
    });
    const zone = makeCircleMarker('drw_1', {
      shape: 'dashedHighlight',
      geometry: { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
    });
    const run = makeCircleMarker('drw_1', {
      shape: 'dashedHighlight',
      geometry: {
        type: 'polyline',
        points: [
          [0, 0],
          [10, 0],
        ],
      },
    });
    for (const marker of [esdv, flange, stroke, zone]) {
      expect(isSegmentSetupMarker(marker, true)).toBe(true);
      expect(isEditableInStage(marker, 'count', true)).toBe(false);
      expect(isEditableInStage(marker, 'segments', true)).toBe(true);
    }
    expect(isSegmentSetupMarker(circle, false)).toBe(false);
    expect(isEditableInStage(circle, 'count', false)).toBe(true);
    // A line run is a pipe length to count only when pipe lengths are counted.
    expect(isSegmentSetupMarker(run, false)).toBe(true);
    expect(isEditableInStage(run, 'count', true)).toBe(true);
  });

  it('reads older projects as defining segments, and keeps the stage on save', () => {
    const project = makeProject();
    const { stage: _omitted, ...older } = project;
    expect(ProjectSchema.parse(older).stage).toBe('segments');
    const doc = projectToDoc({ ...project, stage: 'count' });
    expect(docToProject(doc).stage).toBe('count');
  });
});

describe('segmentReadiness', () => {
  function setup() {
    const drawing = makeDrawing({ id: 'drw_1' });
    const a = makeSegment({ id: 'seg_a', label: 'IS-01', drawingIds: ['drw_1'] });
    const b = makeSegment({ id: 'seg_b', label: 'IS-02', drawingIds: [] });
    const e1 = makeCircleMarker('drw_1', { id: 'esd_1', esdv: esdvData('seg_a', null) });
    const e2 = makeCircleMarker('drw_1', { id: 'esd_2', esdv: esdvData(null, 'seg_a') });
    a.boundingEsdvIds = ['esd_1', 'esd_2'];
    return projectToDoc(
      makeProject({
        settings: makeSettings(),
        drawings: [drawing],
        segments: [a, b],
        markers: [e1, e2],
      }),
    );
  }

  it('finds segments with nothing marked or too few boundaries', () => {
    const doc = setup();
    expect(segmentReadiness(doc)).toEqual([
      {
        kind: 'segmentsWithoutExtent',
        count: 1,
        markerIds: [],
        segmentIds: ['seg_b'],
        names: ['IS-02'],
      },
      {
        kind: 'fewBoundaries',
        count: 1,
        markerIds: [],
        segmentIds: ['seg_b'],
        names: ['IS-02'],
      },
    ]);
  });

  it('finds set-up that belongs to no segment, and counts end flanges as boundaries', () => {
    const doc = setup();
    doc.markers.hl = makeCircleMarker('drw_1', {
      id: 'hl',
      shape: 'highlighter',
      geometry: {
        type: 'stroke',
        points: [
          [0, 0],
          [10, 0],
        ],
        width: 4,
      },
    });
    doc.markers.lost = makeCircleMarker('drw_1', { id: 'lost', esdv: esdvData(null, null) });
    // Circles are counted, not set-up: one with no segment is not listed here.
    doc.markers.c = makeCircleMarker('drw_1', { id: 'c' });
    for (const id of ['f1', 'f2']) {
      doc.markers[id] = makeCircleMarker('drw_1', {
        id,
        segmentId: 'seg_b',
        shape: 'endFlange',
        geometry: {
          type: 'doubleLine',
          points: [
            [0, 0],
            [0, 10],
          ],
          gap: 2,
        },
        endFlange: { tag: '', destination: 'closedDrain' },
      });
    }
    expect(segmentReadiness(doc)).toEqual([
      {
        kind: 'unassignedSetup',
        count: 2,
        markerIds: ['hl', 'lost'],
        segmentIds: [],
        names: [],
      },
    ]);
  });
});
