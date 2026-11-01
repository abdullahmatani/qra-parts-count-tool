import { describe, expect, it } from 'vitest';
import type { CountItem, Drawing, Marker } from './schema/types';
import { countedExamples, hasExamples, pickExamples, symbolRadius } from './symbol-examples';

function marker(id: string, drawingId: string, extra: Partial<Marker> = {}): Marker {
  return {
    id,
    drawingId,
    segmentId: null,
    shape: 'circle',
    geometry: { type: 'circle', cx: 100, cy: 100, r: 10 },
    style: { labelOffset: null, symbol: 'circle', outline: null },
    esdv: null,
    endFlange: null,
    ...extra,
  };
}

function item(markerId: string, drawingId: string, typeId: string | null): CountItem {
  return {
    id: `itm-${markerId}`,
    seq: 1,
    markerId,
    segmentId: null,
    drawingId,
    equipmentTypeId: typeId,
    nominalSize: null,
    sizeUnit: 'in',
    actuation: null,
    quantity: 1,
    tag: '',
    remarks: '',
    pipeLength: null,
  };
}

/** A project with counted markers: [marker id, drawing id, type id]. */
function project(
  counted: [string, string, string | null][],
  fileTypes: Record<string, string> = {},
) {
  const markers: Record<string, Marker> = {};
  const items: Record<string, CountItem> = {};
  for (const [id, drawingId, typeId] of counted) {
    markers[id] = marker(id, drawingId);
    items[`itm-${id}`] = item(id, drawingId, typeId);
  }
  const drawings: Record<string, Drawing> = {};
  for (const id of new Set(counted.map(([, d]) => d).concat(Object.keys(fileTypes)))) {
    drawings[id] = { id, fileType: fileTypes[id] ?? 'pdf' } as Drawing;
  }
  return { markers, items, drawings };
}

const kinds = (examples: ReturnType<typeof pickExamples>) =>
  examples.map((e) => `${e.marker.drawingId}:${e.item.equipmentTypeId}`);

describe('examples for assisted counting (roadmap #59)', () => {
  it('takes counted equipment circles with a type, and not ESDVs or untyped items', () => {
    const doc = project([
      ['a', 'd1', 'valve'],
      ['b', 'd1', null],
    ]);
    doc.markers.c = marker('c', 'd1', {
      esdv: {
        tag: '',
        nominalSize: null,
        sizeUnit: 'in',
        upstreamSegmentId: null,
        downstreamSegmentId: null,
        boundaryRuleOverride: null,
      },
    });
    doc.items['itm-c'] = item('c', 'd1', 'valve');
    expect(countedExamples(doc).map((e) => e.marker.id)).toEqual(['a']);
    expect(hasExamples(doc)).toBe(true);
    expect(hasExamples(project([['b', 'd1', null]]))).toBe(false);
  });

  it('measures the symbol a dot sits on, not the dot', () => {
    const dot = marker('d', 'd1', { style: { labelOffset: null, symbol: 'dot', outline: null } });
    expect(symbolRadius(dot)).toBeGreaterThan(10);
    expect(symbolRadius(marker('r', 'd1'))).toBe(10);
  });

  it('uses the kinds counted on the drawing, and the rest from as few others as have them', () => {
    const doc = project([
      ['v1', 'here', 'valve'],
      ['f1', 'far', 'flange'],
      ['f2', 'near', 'flange'],
      ['p1', 'near', 'pump'],
      ['v2', 'near', 'valve'],
    ]);
    // "near" has both missing kinds; "far" adds nothing once it is used.
    expect(kinds(pickExamples(doc, 'here'))).toEqual(['here:valve', 'near:flange', 'near:pump']);
  });

  it('prefers drawings of the same file type for kinds counted elsewhere', () => {
    const doc = project(
      [
        ['f1', 'cad', 'flange'],
        ['f2', 'pdf2', 'flange'],
      ],
      { here: 'pdf', cad: 'dxf', pdf2: 'pdf' },
    );
    expect(kinds(pickExamples(doc, 'here'))).toEqual(['pdf2:flange']);
  });

  it('keeps one of every kind before more of any one', () => {
    const counted: [string, string, string][] = [];
    for (let i = 0; i < 6; i += 1) counted.push([`v${i}`, 'here', 'valve']);
    counted.push(['f', 'here', 'flange']);
    const picked = kinds(pickExamples(project(counted), 'here'));
    expect(picked.slice(0, 2)).toEqual(['here:valve', 'here:flange']);
    expect(picked).toHaveLength(7);
  });
});
