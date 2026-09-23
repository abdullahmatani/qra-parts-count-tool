import { describe, expect, it } from 'vitest';
import { countEntries } from '../count/count';
import { starterLibrary } from '../count/starter-library';
import { newEsdvData } from '../esdv';
import { projectToDoc } from '../model';
import type { ItemField, TemplateMapping } from '../schema/types';
import {
  makeCircleMarker,
  makeDrawing,
  makeItem,
  makeNote,
  makeProject,
  makeSegment,
} from '@/test/fixtures';
import { exportableProject } from './exportable';
import {
  ITEM_FIELD_ORDER,
  columnLetters,
  columnNumber,
  itemListCsv,
  planExcelExport,
  sheetName,
  splitCellRef,
  type ExcelLabels,
} from './excel-plan';

const labels: ExcelLabels = {
  notesSheet: 'Notes',
  itemsSheet: 'Item List',
  unmappedSheet: 'Unmapped',
  segment: 'Segment',
  author: 'Author',
  time: 'Time',
  note: 'Note',
  itemFields: Object.fromEntries(ITEM_FIELD_ORDER.map((f) => [f, f])) as Record<ItemField, string>,
  typeName: 'Type',
  actuation: 'Actuation',
  bin: 'Bin',
  quantity: 'Quantity',
  unit: 'Unit',
  actuations: { manual: 'Manual', automated: 'Automated' },
  seeNotesSheet: 'see Notes',
};

function setup() {
  const library = starterLibrary();
  const valve = library.equipmentTypes[0]!;
  const flange = library.equipmentTypes[1]!;
  const manualBins = library.binSets.find((b) => b.name === 'Valves, manual')!.bins;
  const flangeBins = library.binSets.find((b) => b.name === 'Flanges')!.bins;
  const drawing = makeDrawing({ id: 'drw_1', drawingNo: 'PEFS-001', revision: 'C' });
  const s1 = makeSegment({
    id: 'seg_1',
    label: 'IS-01',
    fluid: 'Gas',
    pressure: 45,
    drawingIds: ['drw_1'],
  });
  const s2 = makeSegment({ id: 'seg_2', label: 'IS-02', colour: 2 });
  const m1 = makeCircleMarker('drw_1', { id: 'mkr_1', segmentId: 'seg_1' });
  const m2 = makeCircleMarker('drw_1', { id: 'mkr_2', segmentId: 'seg_1' });
  const m3 = makeCircleMarker('drw_1', { id: 'mkr_3', segmentId: 'seg_2' });
  const esdv = makeCircleMarker('drw_1', {
    id: 'mkr_esdv',
    esdv: {
      ...newEsdvData('in'),
      tag: 'ESDV-1',
      nominalSize: 12,
      upstreamSegmentId: 'seg_1',
      downstreamSegmentId: 'seg_2',
    },
  });
  const items = [
    makeItem(m1, 1, {
      id: 'itm_1',
      equipmentTypeId: valve.id,
      actuation: 'manual',
      nominalSize: 2,
      tag: 'HV-1',
    }),
    makeItem(m2, 2, { id: 'itm_2', equipmentTypeId: flange.id, nominalSize: 4, quantity: 3 }),
    makeItem(m3, 3, {
      id: 'itm_3',
      equipmentTypeId: valve.id,
      actuation: 'manual',
      nominalSize: 2,
      remarks: 'Needs "check", later',
    }),
  ];
  const doc = projectToDoc(
    makeProject({
      name: 'Plant A QRA',
      studyRef: 'QRA-7',
      drawings: [drawing],
      segments: [s1, { ...s2, boundingEsdvIds: ['mkr_esdv'] }],
      markers: [m1, m2, m3, esdv],
      items,
      notes: [makeNote('seg_1', { text: '**Scope**\n- valves' })],
      library,
      nextItemSeq: 4,
    }),
  );
  doc.segments.seg_1!.boundingEsdvIds = ['mkr_esdv'];
  const project = exportableProject(doc);
  const entries = countEntries(doc);
  const bin = (bins: typeof manualBins, label: string) => bins.find((b) => b.label === label)!.id;
  return {
    project,
    entries,
    valve,
    flange,
    valve2: bin(manualBins, '1" < x ≤ 2"'),
    flange6: bin(flangeBins, '3" < x ≤ 6"'),
  };
}

function mapping(overrides: Partial<TemplateMapping>): TemplateMapping {
  return {
    templateFile: 'template.xlsx',
    layoutMode: 'sheetPerSegment',
    sheet: 'Master',
    startRow: 1,
    blockOffset: null,
    sheetNamePattern: '{segment}',
    headerFields: {},
    countCells: [],
    pipeLengthCells: [],
    notesCell: null,
    itemColumns: {},
    ...overrides,
  };
}

const now = new Date('2026-09-23T10:00:00Z');

describe('cell and sheet names', () => {
  it('splits references and converts columns', () => {
    expect(splitCellRef('$D$14')).toEqual({ column: 'D', row: 14 });
    expect(splitCellRef('ab')).toEqual({ column: 'AB', row: null });
    expect(() => splitCellRef('14D')).toThrow();
    expect(columnNumber('AA')).toBe(27);
    expect(columnLetters(28)).toBe('AB');
    expect(columnLetters(columnNumber('XFD'))).toBe('XFD');
  });

  it('makes valid, unique sheet names', () => {
    const taken = new Set(['master']);
    expect(sheetName('IS/01: [gas]?', taken)).toBe('IS_01_ _gas__');
    expect(sheetName('Master', taken)).toBe('Master (2)');
    expect(sheetName('x'.repeat(40), taken)).toHaveLength(31);
  });
});

describe('Excel export plan (section 7)', () => {
  it('sheet per segment: copies the master for each segment and fills it', () => {
    const { project, entries, valve, flange, valve2, flange6 } = setup();
    const plan = planExcelExport({
      project,
      entries,
      now,
      labels,
      templateSheets: ['Master', 'Notes'],
      mapping: mapping({
        headerFields: {
          segmentLabel: 'B2',
          fluid: 'B3',
          pressure: 'B4',
          linkedDrawingNumbers: 'B5',
          date: 'B6',
        },
        countCells: [
          { equipmentTypeId: valve.id, actuation: 'manual', binId: valve2, cell: 'D14' },
          { equipmentTypeId: flange.id, actuation: null, binId: flange6, cell: 'E20' },
        ],
        notesCell: 'B30',
      }),
    });
    expect(plan.copies).toEqual([
      { source: 'Master', name: 'IS-01' },
      { source: 'Master', name: 'IS-02' },
    ]);
    expect(plan.removeSheets).toEqual(['Master']);
    const at = (sheet: string, address: string) =>
      plan.writes.find((w) => w.sheet === sheet && w.address === address)?.value;
    expect(at('IS-01', 'B2')).toBe('IS-01');
    expect(at('IS-01', 'B3')).toBe('Gas');
    expect(at('IS-01', 'B4')).toBe(45);
    expect(at('IS-01', 'B5')).toBe('PEFS-001 / 1');
    expect(at('IS-01', 'B6')).toBe('2026-09-23');
    expect(at('IS-01', 'D14')).toBe(1);
    expect(at('IS-01', 'E20')).toBe(3);
    expect(at('IS-02', 'D14')).toBe(1);
    expect(at('IS-02', 'E20')).toBe(0);
    expect(at('IS-01', 'B30')).toBe('[AM, 2026-09-23] Scope\n\n• valves');
    // The ESDV (automated valve, upstream rule → IS-01) has no mapped cell.
    expect(plan.unmapped).toEqual([
      expect.objectContaining({
        segmentLabel: 'IS-01',
        typeName: 'Valve',
        actuation: 'automated',
        binLabel: '> 11"',
        quantity: 1,
      }),
    ]);
    // The template already has a Notes sheet.
    expect(plan.extraSheets.map((s) => s.name)).toEqual(['Notes (2)', 'Item List', 'Unmapped']);
  });

  it('row per segment: one row per segment from the start row, columns only', () => {
    const { project, entries, valve, valve2 } = setup();
    const plan = planExcelExport({
      project,
      entries,
      now,
      labels,
      templateSheets: ['Summary'],
      mapping: mapping({
        layoutMode: 'rowPerSegment',
        sheet: 'Summary',
        startRow: 5,
        headerFields: { segmentLabel: 'A' },
        countCells: [{ equipmentTypeId: valve.id, actuation: 'manual', binId: valve2, cell: 'C9' }],
      }),
    });
    expect(plan.copies).toEqual([]);
    expect(plan.writes.map((w) => `${w.sheet}!${w.address}=${w.value}`)).toEqual([
      'Summary!A5=IS-01',
      'Summary!C5=1',
      'Summary!A6=IS-02',
      'Summary!C6=1',
    ]);
  });

  it('block per segment: repeats the block down the sheet, copying its styles', () => {
    const { project, entries } = setup();
    const plan = planExcelExport({
      project,
      entries,
      now,
      labels,
      templateSheets: ['Blocks'],
      mapping: mapping({
        layoutMode: 'blockPerSegment',
        sheet: 'Blocks',
        blockOffset: 25,
        headerFields: { segmentLabel: 'B3' },
      }),
    });
    expect(plan.writes).toEqual([
      { sheet: 'Blocks', address: 'B3', value: 'IS-01' },
      { sheet: 'Blocks', address: 'B28', value: 'IS-02', styleFrom: 'B3' },
    ]);
  });

  it('flat item list: one row per counted item, including ESDVs', () => {
    const { project, entries } = setup();
    const plan = planExcelExport({
      project,
      entries,
      now,
      labels,
      templateSheets: ['Items'],
      mapping: mapping({
        layoutMode: 'flatItemList',
        sheet: 'Items',
        startRow: 3,
        headerFields: { projectName: 'B1', segmentLabel: 'B2' },
        itemColumns: {
          seq: 'A',
          segmentLabel: 'B',
          equipmentType: 'C',
          bin: 'D',
          effectiveCount: 'E',
        },
      }),
    });
    const rows = plan.writes.filter((w) => w.address.endsWith('3') || w.address.endsWith('4'));
    expect(plan.writes[0]).toEqual({ sheet: 'Items', address: 'B1', value: 'Plant A QRA' });
    expect(plan.writes.some((w) => w.address === 'B2')).toBe(false);
    expect(rows.slice(0, 5).map((w) => w.value)).toEqual([1, 'IS-01', 'Valve', '1" < x ≤ 2"', 1]);
    // Every count is in the list, so nothing is unmapped.
    expect(plan.unmapped).toEqual([]);
    expect(plan.extraSheets[1]!.rows).toHaveLength(4);
  });

  it('without a template, lists every count as unmapped and still adds the data sheets', () => {
    const { project, entries } = setup();
    const plan = planExcelExport({
      project,
      entries,
      now,
      labels,
      templateSheets: [],
      mapping: null,
    });
    expect(plan.writes).toEqual([]);
    // In count-table order: automated valves (the ESDV), manual valves, flanges.
    expect(
      plan.unmapped.map((u) => `${u.segmentLabel} ${u.typeName} ${u.actuation} ${u.quantity}`),
    ).toEqual([
      'IS-01 Valve automated 1',
      'IS-01 Valve manual 1',
      'IS-01 Flange null 3',
      'IS-02 Valve manual 1',
    ]);
    const notes = plan.extraSheets[0]!;
    expect(notes.rows).toEqual([['IS-01', 'AM', '2026-09-23 10:00', 'Scope\n\n• valves']]);
  });
});

describe('CSV item list (EXP-06)', () => {
  it('quotes fields with commas, quotes and line breaks', () => {
    const { project, entries } = setup();
    const plan = planExcelExport({
      project,
      entries,
      now,
      labels,
      templateSheets: [],
      mapping: null,
    });
    void plan;
    const csv = itemListCsv(
      [
        {
          ...Object.fromEntries(ITEM_FIELD_ORDER.map((f) => [f, null])),
          seq: 3,
          remarks: 'Needs "check", later',
        } as Record<ItemField, string | number | null>,
      ],
      labels.itemFields,
    );
    const [header, row] = csv.split('\r\n');
    expect(header!.split(',')[0]).toBe('seq');
    expect(row).toContain('"Needs ""check"", later"');
    expect(row!.startsWith('3,')).toBe(true);
  });
});
