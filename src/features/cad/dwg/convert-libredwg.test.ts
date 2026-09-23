import type { DwgDatabase } from '@mlightcad/libredwg-web';
import { describe, expect, it } from 'vitest';
import { buildDisplayList } from '../display-list';
import { convertDwgDatabase, markOverallViewport } from './convert-libredwg';

const base = { layer: '0', colorIndex: 256, lineweight: 29, lineType: '', isVisible: true };

function viewport(handle: string, owner: string, viewportId: number) {
  return {
    ...base,
    type: 'VIEWPORT',
    handle,
    ownerBlockRecordSoftId: owner,
    viewportCenter: { x: 50, y: 50, z: 0 },
    width: 100,
    height: 100,
    displayCenter: { x: 50, y: 50 },
    viewHeight: 100,
    status: 0,
    viewportId,
  };
}

/** A minimal database in the shape LibreDWG's `convert()` returns. */
function database(): DwgDatabase {
  return {
    header: { INSUNITS: 4, LTSCALE: 1 },
    tables: {
      LAYER: {
        entries: [
          { name: '0', colorIndex: 7, lineType: 'CONTINUOUS', lineweight: -3 },
          { name: 'PIPE', colorIndex: 1, lineType: 'CONTINUOUS', lineweight: -3, off: true },
        ],
      },
      LTYPE: { entries: [] },
      BLOCK_RECORD: {
        entries: [
          { handle: '1F', name: '*Model_Space', basePoint: { x: 0, y: 0 } },
          { handle: '50', name: '*Paper_Space0', basePoint: { x: 0, y: 0 } },
          { handle: '55', name: '*Paper_Space', basePoint: { x: 0, y: 0 } },
        ],
      },
    },
    entities: [
      {
        ...base,
        type: 'LINE',
        handle: 'A0',
        ownerBlockRecordSoftId: '1F',
        startPoint: { x: 0, y: 0, z: 0 },
        endPoint: { x: 100, y: 100, z: 0 },
      },
      {
        ...base,
        type: 'ARC',
        handle: 'A1',
        ownerBlockRecordSoftId: '1F',
        center: { x: 10, y: 10, z: 0 },
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
      { ...base, type: 'MULTILEADER', handle: 'A2', ownerBlockRecordSoftId: '1F' },
      // Layout 1: only the sheet's own viewport (LibreDWG numbers it 1).
      viewport('84', '50', 1),
      // Layout 2: the sheet's viewport, numbered 2 by LibreDWG.
      viewport('88', '55', 2),
    ],
    objects: {
      LAYOUT: [
        { layoutName: 'Model', tabOrder: 0, paperSpaceTableId: '1F' },
        { layoutName: 'Layout2', tabOrder: 2, paperSpaceTableId: '55' },
        { layoutName: 'Layout1', tabOrder: 1, paperSpaceTableId: '50' },
      ],
    },
  } as unknown as DwgDatabase;
}

describe('convertDwgDatabase', () => {
  it('converts model-space entities, with angles in degrees', () => {
    const doc = convertDwgDatabase(database());
    expect(doc.units).toBe(4);
    expect(doc.modelSpace.map((e) => e.type)).toEqual(['line', 'arc']);
    const arc = doc.modelSpace[1];
    expect(arc?.type === 'arc' && [arc.startAngle, arc.endAngle]).toEqual([0, 90]);
  });

  it('reports entities it cannot convert', () => {
    expect(convertDwgDatabase(database()).unsupported).toEqual({ MULTILEADER: 1 });
  });

  it('reads layers, including hidden ones', () => {
    const doc = convertDwgDatabase(database());
    expect(doc.layers.PIPE).toMatchObject({ color: { kind: 'aci', index: 1 }, visible: false });
  });

  it('lists layouts in tab order and treats their first viewport as the sheet', () => {
    const doc = convertDwgDatabase(database());
    expect(doc.layouts.map((l) => l.name)).toEqual(['Layout1', 'Layout2']);
    for (const layout of doc.layouts) {
      expect(layout.entities[0]).toMatchObject({ type: 'viewport', id: 1 });
      // The sheet's own viewport never shows model space.
      expect(buildDisplayList(doc, layout.name).stats.paths).toBe(0);
    }
  });
});

describe('markOverallViewport', () => {
  it('marks only the first viewport', () => {
    const vp = {
      type: 'viewport',
      layer: '0',
      color: { kind: 'byLayer' },
      center: [0, 0],
      width: 1,
      height: 1,
      viewCenter: [0, 0],
      viewHeight: 1,
      twist: 0,
      frozenLayers: [],
      on: true,
    } as const;
    const out = markOverallViewport([
      { type: 'line', layer: '0', color: { kind: 'byLayer' }, start: [0, 0], end: [1, 1] },
      { ...vp, id: 5 },
      { ...vp, id: 6 },
    ] as Parameters<typeof markOverallViewport>[0]);
    expect(out.map((e) => (e.type === 'viewport' ? e.id : null))).toEqual([null, 1, 6]);
  });
});
