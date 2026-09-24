import { describe, expect, it } from 'vitest';
import { newEsdvData } from '../esdv';
import { projectToDoc, type ProjectDoc } from '../model';
import type { CountItem, Marker } from '../schema/types';
import { makeCircleMarker, makeDrawing, makeItem, makeProject, makeSegment } from '@/test/fixtures';
import {
  acceptDuplicate,
  buildCountTable,
  countEntries,
  findDuplicateTags,
  markerWarningMap,
  normaliseTag,
  previewBin,
} from './count';
import { starterLibrary } from './starter-library';

function setup() {
  const library = starterLibrary();
  const drawing = makeDrawing({ id: 'drw_1' });
  const other = makeDrawing({ id: 'drw_2', drawingNo: 'PEFS-002' });
  const a = makeSegment({ id: 'seg_a', label: 'IS-01', drawingIds: ['drw_1'] });
  const b = makeSegment({ id: 'seg_b', label: 'IS-02', colour: 2 });
  const doc = projectToDoc(makeProject({ drawings: [drawing, other], segments: [a, b], library }));
  const type = (name: string) => library.equipmentTypes.find((t) => t.name === name)!.id;
  let n = 0;
  const add = (overrides: Partial<CountItem> & { markerOverrides?: Partial<Marker> } = {}) => {
    const { markerOverrides, ...itemOverrides } = overrides;
    n += 1;
    const marker = makeCircleMarker(itemOverrides.drawingId ?? 'drw_1', {
      id: `mkr_${n}`,
      segmentId: itemOverrides.segmentId === undefined ? 'seg_a' : itemOverrides.segmentId,
      ...markerOverrides,
    });
    doc.markers[marker.id] = marker;
    const item = makeItem(marker, n, { id: `itm_${n}`, ...itemOverrides });
    doc.items[item.id] = item;
    return item;
  };
  return { doc, library, type, add };
}

function table(doc: ProjectDoc, segmentId: string | null) {
  return buildCountTable(countEntries(doc), doc.library, segmentId, {
    pipeLengthCounting: doc.settings.pipeLengthCounting,
  });
}

describe('count entries (CNT-01, CNT-03, CNT-05)', () => {
  it('bins sized items, and splits valves by actuation', () => {
    const { doc, type, add } = setup();
    add({ equipmentTypeId: type('Valve'), actuation: 'manual', nominalSize: 2 });
    add({
      equipmentTypeId: type('Valve'),
      actuation: 'automated',
      nominalSize: 50,
      sizeUnit: 'DN',
    });
    add({ equipmentTypeId: type('Valve'), actuation: 'manual', nominalSize: 1.5, quantity: 3 });
    const t = table(doc, 'seg_a');
    expect(t.total).toBe(5);
    const [automated, manual] = t.groups;
    expect(automated!.binSet.name).toBe('Valves, automated');
    expect(automated!.rows[0]).toMatchObject({
      typeName: 'Valve',
      actuation: 'automated',
      total: 1,
    });
    const manualRow = manual!.rows[0]!;
    expect(manualRow.actuation).toBe('manual');
    const bin = manual!.binSet.bins.find((b) => b.label === '1" < x ≤ 2"')!;
    expect(manualRow.cells.find((c) => c.binId === bin.id)).toMatchObject({
      quantity: 4,
      markerIds: ['mkr_1', 'mkr_3'],
    });
  });

  it('flags incomplete items and leaves them out of the totals', () => {
    const { doc, type, add } = setup();
    add({ equipmentTypeId: null, nominalSize: 2 });
    add({ equipmentTypeId: type('Valve'), nominalSize: 2 });
    add({ equipmentTypeId: type('Flange') });
    add({ equipmentTypeId: type('Pump, centrifugal (single seal)') });
    const entries = countEntries(doc);
    expect(entries.map((e) => e.issues)).toEqual([['noType'], ['noActuation'], ['noSize'], []]);
    const t = table(doc, 'seg_a');
    expect(t.total).toBe(1);
    expect(t.incomplete).toEqual({ count: 3, markerIds: ['mkr_1', 'mkr_2', 'mkr_3'] });
  });

  it('counts flange faces as two per joint when the project says so (CNT-09)', () => {
    const { doc, type, add } = setup();
    add({ equipmentTypeId: type('Flange'), nominalSize: 6, quantity: 2 });
    expect(table(doc, 'seg_a').total).toBe(2);
    doc.settings.flangeConvention = 'perFace';
    expect(table(doc, 'seg_a').total).toBe(4);
  });

  it('counts ESDVs as automated valves where the boundary rule says (SEG-08)', () => {
    const { doc } = setup();
    doc.markers.mkr_esdv = makeCircleMarker('drw_1', {
      id: 'mkr_esdv',
      esdv: {
        ...newEsdvData('in'),
        tag: 'ESDV-1',
        nominalSize: 12,
        upstreamSegmentId: 'seg_a',
        downstreamSegmentId: 'seg_b',
      },
    });
    doc.settings.esdvBoundaryRule = 'both';
    for (const segment of ['seg_a', 'seg_b']) {
      const t = table(doc, segment);
      expect(t.groups[0]!.rows[0]).toMatchObject({ actuation: 'automated', total: 1 });
    }
    doc.settings.esdvBoundaryRule = 'downstream';
    expect(table(doc, 'seg_a').total).toBe(0);
    // The project summary counts the ESDV once per counting segment.
    doc.settings.esdvBoundaryRule = 'both';
    expect(table(doc, null).total).toBe(2);
  });

  it('builds the project summary across all segments but not unassigned items (CNT-07)', () => {
    const { doc, type, add } = setup();
    add({ equipmentTypeId: type('Pump, centrifugal (single seal)') });
    add({ equipmentTypeId: type('Pump, centrifugal (single seal)'), segmentId: 'seg_b' });
    add({ equipmentTypeId: type('Pump, centrifugal (single seal)'), segmentId: null });
    expect(table(doc, null).total).toBe(2);
    expect(table(doc, 'seg_b').total).toBe(1);
  });

  it('sums pipe lengths per size bin when the project counts them (CNT-12)', () => {
    const { doc, type, add } = setup();
    add({ equipmentTypeId: type('Pipe'), nominalSize: 4, pipeLength: 12.5 });
    add({ equipmentTypeId: type('Pipe'), nominalSize: 5, pipeLength: 7.5 });
    add({ equipmentTypeId: type('Pipe'), nominalSize: 5 });
    expect(table(doc, 'seg_a').pipeLengths).toEqual([]);
    doc.settings.pipeLengthCounting = true;
    const t = table(doc, 'seg_a');
    expect(t.total).toBe(0);
    expect(t.pipeLengths[0]!.total).toBe(20);
    const cell = t.pipeLengths[0]!.cells.find((c) => c.metres > 0)!;
    expect(cell.markerIds).toEqual(['mkr_1', 'mkr_2']);
    expect(t.incomplete.markerIds).toEqual(['mkr_3']);
  });

  it('previews the bin for the item editor', () => {
    const { doc, type } = setup();
    expect(previewBin(doc.library, type('Valve'), 'manual', { value: 3, unit: 'in' })?.label).toBe(
      '2" < x ≤ 3"',
    );
    expect(previewBin(doc.library, null, null, { value: 3, unit: 'in' })).toBeNull();
  });
});

describe('duplicate tags (CNT-08)', () => {
  it('normalises tags', () => {
    expect(normaliseTag(' hv 101 ')).toBe('HV-101');
    expect(normaliseTag('HV__101')).toBe('HV-101');
    expect(normaliseTag('HV--101')).toBe('HV-101');
  });

  it('finds a tag counted on two drawings, until the user accepts it', () => {
    const { doc, type, add } = setup();
    add({ equipmentTypeId: type('Valve'), actuation: 'manual', nominalSize: 2, tag: 'HV-101' });
    add({
      equipmentTypeId: type('Valve'),
      actuation: 'manual',
      nominalSize: 2,
      tag: 'hv 101',
      drawingId: 'drw_2',
    });
    add({ equipmentTypeId: type('Valve'), actuation: 'manual', nominalSize: 2, tag: 'HV-102' });
    const [duplicate] = findDuplicateTags(countEntries(doc), doc);
    expect(duplicate).toEqual({
      tag: 'HV-101',
      markerIds: ['mkr_1', 'mkr_2'],
      drawingIds: ['drw_1', 'drw_2'],
      accepted: false,
    });
    expect(markerWarningMap(doc).get('mkr_1')).toEqual(['duplicate']);
    acceptDuplicate(doc, 'Hv-101', 'Match line', new Date('2026-09-23T00:00:00Z'));
    acceptDuplicate(doc, 'HV-101', 'again', new Date());
    expect(doc.acceptedDuplicates).toHaveLength(1);
    expect(findDuplicateTags(countEntries(doc), doc)[0]!.accepted).toBe(true);
    expect(markerWarningMap(doc).get('mkr_1')).toBeUndefined();
  });

  it('does not treat an ESDV counted in two segments as a duplicate', () => {
    const { doc } = setup();
    doc.markers.mkr_esdv = makeCircleMarker('drw_1', {
      id: 'mkr_esdv',
      esdv: {
        ...newEsdvData('in'),
        tag: 'ESDV-1',
        nominalSize: 12,
        upstreamSegmentId: 'seg_a',
        downstreamSegmentId: 'seg_b',
      },
    });
    doc.settings.esdvBoundaryRule = 'both';
    expect(findDuplicateTags(countEntries(doc), doc)).toEqual([]);
  });
});

describe('marker warnings', () => {
  it('collects unassigned and incomplete markers', () => {
    const { doc, type, add } = setup();
    add({ equipmentTypeId: type('Pump, centrifugal (single seal)'), segmentId: null });
    add({ equipmentTypeId: null });
    const warnings = markerWarningMap(doc);
    expect(warnings.get('mkr_1')).toEqual(['unassigned']);
    expect(warnings.get('mkr_2')).toEqual(['incomplete']);
  });
});
