import { describe, expect, it } from 'vitest';
import { countEntries } from '../count/count';
import { starterLibrary } from '../count/starter-library';
import { projectToDoc } from '../model';
import { ESDV_COLOUR, MARKER_WARNING, SEGMENT_PALETTE, UNASSIGNED_COLOUR } from '../palette';
import {
  makeCircleMarker,
  makeDrawing,
  makeItem,
  makeProject,
  makeSegment,
  makeSettings,
} from '@/test/fixtures';
import { drawingName, planPdfExport, stampDate, type PdfLabels } from './pdf-plan';

const labels: PdfLabels = {
  endFlange: 'End flange',
  legendTitle: 'Legend',
  esdv: 'ESDV',
  unassigned: 'Not in a segment',
  warning: 'Needs attention',
  drawing: (d) => `${drawingName(d)} rev ${d.revision}`,
  segment: (label) => `Segment ${label}`,
  allSegments: 'All segments',
  countRevision: (rev) => `Count revision ${rev}`,
  exported: (date) => `Exported ${date}`,
};

function setup(pattern = '{drawingNo}_{rev}_annotated') {
  const library = starterLibrary();
  const pump = library.equipmentTypes.find((t) => t.category === 'pump')!.id;
  const d1 = makeDrawing({ id: 'drw_1', drawingNo: 'PEFS-1001', revision: 'B' });
  const d2 = makeDrawing({ id: 'drw_2', drawingNo: 'PEFS-1002', revision: '', page: 2 });
  const d3 = makeDrawing({
    id: 'drw_3',
    drawingNo: '',
    fileName: 'unit-3.dxf',
    originalFileName: 'Unit 3.dxf',
    fileType: 'dxf',
    page: null,
    layout: 'A1',
  });
  // A second sheet with the same number and revision gets a unique name.
  const d4 = makeDrawing({ id: 'drw_4', drawingNo: 'PEFS-1001', revision: 'B', sheet: '2' });
  const a = makeSegment({ id: 'seg_a', label: 'IS-01', fluid: 'Gas', colour: 1 });
  const b = makeSegment({ id: 'seg_b', label: 'IS-02', colour: 2, drawingIds: ['drw_3'] });
  const m1 = makeCircleMarker('drw_1', { id: 'mkr_1', segmentId: 'seg_a' });
  const m2 = makeCircleMarker('drw_1', {
    id: 'mkr_2',
    segmentId: 'seg_b',
    shape: 'dashedHighlight',
    geometry: { type: 'rect', x: 10, y: 10, width: 50, height: 40 },
  });
  const m3 = makeCircleMarker('drw_2', { id: 'mkr_3', segmentId: null });
  const esdv = makeCircleMarker('drw_1', {
    id: 'mkr_e',
    esdv: {
      tag: 'ESDV-101',
      nominalSize: 8,
      sizeUnit: 'in',
      upstreamSegmentId: 'seg_a',
      downstreamSegmentId: 'seg_b',
      boundaryRuleOverride: null,
    },
  });
  const doc = projectToDoc(
    makeProject({
      name: 'Plant A',
      studyRef: 'QRA-7',
      countRevision: 'C',
      settings: makeSettings({ exportFilenamePattern: pattern }),
      drawings: [d1, d2, d3, d4],
      segments: [a, b],
      markers: [m1, m2, m3, esdv],
      items: [
        makeItem(m1, 1, { equipmentTypeId: pump, tag: 'P-101' }),
        makeItem(m3, 2, { equipmentTypeId: null }),
      ],
      library,
      nextItemSeq: 3,
    }),
  );
  return doc;
}

const now = new Date(2026, 8, 23, 10, 45);

describe('planPdfExport (EXP-03, EXP-05)', () => {
  it('plans one PDF per drawing with markers, labels, legend and stamp', () => {
    const doc = setup();
    const plans = planPdfExport({
      doc,
      entries: countEntries(doc),
      drawings: true,
      segments: false,
      now,
      labels,
    });
    expect(plans.map((p) => p.fileName)).toEqual([
      'PEFS-1001_B_annotated.pdf',
      'PEFS-1002_annotated.pdf',
      'Unit 3_A_annotated.pdf',
      'PEFS-1001_B_annotated (2).pdf',
    ]);
    const first = plans[0]!.pages[0]!.overlay;
    // Areas first, then circles; labels from tags, ESDV tags and item numbers.
    expect(first.markers.map((m) => [m.geometry.type, m.label])).toEqual([
      ['rect', ''],
      ['circle', 'P-101'],
      ['circle', 'ESDV-101'],
    ]);
    expect(first.markers[1]).toMatchObject({ colour: SEGMENT_PALETTE[0], esdv: false });
    expect(first.markers[2]).toMatchObject({ colour: ESDV_COLOUR, esdv: true });
    expect(first.legend).toEqual([
      { label: 'IS-01 – Gas', colour: SEGMENT_PALETTE[0], dash: [], kind: 'circle' },
      { label: 'IS-02', colour: SEGMENT_PALETTE[1], dash: [], kind: 'circle' },
      { label: 'ESDV', colour: ESDV_COLOUR, dash: [], kind: 'esdv' },
    ]);
    expect(first.stamp).toEqual([
      'Plant A · QRA-7',
      'PEFS-1001 rev B',
      'Count revision C',
      'Exported 2026-09-23',
    ]);

    // An unassigned marker with an incomplete item is flagged and explained.
    const second = plans[1]!.pages[0]!.overlay;
    expect(second.markers).toEqual([
      expect.objectContaining({ colour: UNASSIGNED_COLOUR, warning: true, label: '#2' }),
    ]);
    expect(second.legend.map((e) => [e.label, e.colour])).toEqual([
      ['Not in a segment', UNASSIGNED_COLOUR],
      ['Needs attention', MARKER_WARNING],
    ]);
    // A drawing with no markers still gets its PDF, with an empty legend.
    expect(plans[2]!.pages[0]!.overlay).toMatchObject({ markers: [], legend: [] });
  });

  it('draws an ESDV double line over the highlights, with its own legend entry', () => {
    const doc = setup();
    const esdv = doc.markers.mkr_e!;
    esdv.shape = 'doubleLine';
    esdv.geometry = {
      type: 'doubleLine',
      points: [
        [100, 80],
        [100, 120],
      ],
      gap: 6,
    };
    doc.markers.hl = makeCircleMarker('drw_1', {
      id: 'hl',
      segmentId: 'seg_a',
      shape: 'highlighter',
      geometry: {
        type: 'stroke',
        points: [
          [0, 100],
          [90, 100],
        ],
        width: 10,
      },
    });
    const [first] = planPdfExport({
      doc,
      entries: countEntries(doc),
      drawings: true,
      segments: false,
      now,
      labels,
    });
    const overlay = first!.pages[0]!.overlay;
    expect(overlay.markers.map((m) => [m.geometry.type, m.label])).toEqual([
      ['rect', ''],
      ['stroke', ''],
      ['circle', 'P-101'],
      ['doubleLine', 'ESDV-101'],
    ]);
    expect(overlay.legend.at(-1)).toEqual({
      label: 'ESDV',
      colour: ESDV_COLOUR,
      dash: [],
      kind: 'esdvLine',
    });
    expect(overlay.legend.filter((e) => e.kind === 'esdv')).toEqual([]);
  });

  it('draws an end flange in the colour of its segment, with its own legend entry', () => {
    const doc = setup();
    doc.markers.fl = makeCircleMarker('drw_2', {
      id: 'fl',
      segmentId: 'seg_a',
      shape: 'endFlange',
      geometry: {
        type: 'doubleLine',
        points: [
          [100, 80],
          [100, 120],
        ],
        gap: 4,
      },
      endFlange: { tag: '', destination: 'flare' },
    });
    const plans = planPdfExport({
      doc,
      entries: countEntries(doc),
      drawings: true,
      segments: false,
      now,
      labels,
    });
    const overlay = plans[1]!.pages[0]!.overlay;
    expect(overlay.markers.find((m) => m.endFlange)).toMatchObject({
      colour: SEGMENT_PALETTE[0],
      label: 'To flare',
      esdv: false,
      warning: false,
    });
    expect(overlay.legend.map((e) => e.kind)).toEqual(['circle', 'endFlange', 'circle', 'warning']);
  });

  it('plans a combined PDF per segment with only that segment on each page', () => {
    const doc = setup();
    const plans = planPdfExport({
      doc,
      entries: countEntries(doc),
      drawings: false,
      segments: true,
      now,
      labels,
    });
    expect(plans.map((p) => [p.fileName, p.pages.map((pg) => pg.drawingId)])).toEqual([
      ['IS-01_drawings.pdf', ['drw_1']],
      // IS-02: its marker on PEFS-1001 and the linked (but unmarked) Unit 3 layout.
      ['IS-02_drawings.pdf', ['drw_1', 'drw_3']],
    ]);
    const is01 = plans[0]!.pages[0]!.overlay;
    // The ESDV bounds both segments, so it appears in both.
    expect(is01.markers.map((m) => m.label)).toEqual(['P-101', 'ESDV-101']);
    expect(is01.stamp).toContain('Segment IS-01');
    const is02 = plans[1]!.pages[0]!.overlay;
    expect(is02.markers.map((m) => m.geometry.type)).toEqual(['rect', 'circle']);
  });

  it('plans one PDF with every segment, bookmarked segment by segment', () => {
    const doc = setup();
    const plans = planPdfExport({
      doc,
      entries: countEntries(doc),
      drawings: false,
      segments: true,
      allSegments: true,
      now,
      labels,
    });
    expect(plans.map((p) => [p.kind, p.fileName])).toEqual([
      ['segment', 'IS-01_drawings.pdf'],
      ['segment', 'IS-02_drawings.pdf'],
      ['allSegments', 'Plant A_all_segments.pdf'],
    ]);
    const [is01, is02, all] = plans;
    expect(all!.title).toBe('Plant A – All segments');
    // The segments' own pages, in segment order, each opening at a bookmark.
    expect(all!.pages).toEqual([...is01!.pages, ...is02!.pages]);
    expect(all!.pages.map((p) => p.drawingId)).toEqual(['drw_1', 'drw_1', 'drw_3']);
    expect(all!.outline).toEqual([
      { title: 'IS-01 – Gas', pageIndex: 0 },
      { title: 'IS-02', pageIndex: 1 },
    ]);
    expect(all!.pages[2]!.overlay.stamp).toContain('Segment IS-02');
    expect(is01!.outline).toEqual([]);
  });

  it('plans the all-segments PDF on its own, and only when a segment has pages', () => {
    const doc = setup();
    const only = planPdfExport({
      doc,
      entries: countEntries(doc),
      drawings: false,
      segments: false,
      allSegments: true,
      now,
      labels,
    });
    expect(only.map((p) => [p.kind, p.pages.length])).toEqual([['allSegments', 3]]);

    for (const marker of Object.values(doc.markers)) {
      marker.segmentId = null;
      marker.esdv = null;
    }
    doc.segments.seg_b!.drawingIds = [];
    expect(
      planPdfExport({
        doc,
        entries: countEntries(doc),
        drawings: false,
        segments: true,
        allSegments: true,
        now,
        labels,
      }),
    ).toEqual([]);
  });

  it('fills every pattern token and keeps names unique across outputs', () => {
    const doc = setup('{project}_{segment}_{drawingNo}_{rev}_p{page}');
    const taken = new Set(['plant a_is-01+is-02_pefs-1001_b_p1.pdf']);
    const plans = planPdfExport({
      doc,
      entries: countEntries(doc),
      drawings: true,
      segments: false,
      now,
      labels,
      taken,
    });
    expect(plans[0]!.fileName).toBe('Plant A_IS-01+IS-02_PEFS-1001_B_p1 (2).pdf');
    expect(plans[1]!.fileName).toBe('Plant A_PEFS-1002_p2.pdf');
  });

  it('formats the stamp date in local time', () => {
    expect(stampDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
