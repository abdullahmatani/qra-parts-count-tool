import type { DwgDatabase, DwgEntity } from '@mlightcad/libredwg-web';
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

/** The minimal database with only the given model-space entities. */
function modelSpace(entities: Record<string, unknown>[]): DwgDatabase {
  const db = database();
  db.entities = entities.map(
    (entity, i) =>
      ({ ...base, handle: `B${i}`, ownerBlockRecordSoftId: '1F', ...entity }) as DwgEntity,
  );
  return db;
}

describe('convertDwgDatabase', () => {
  it('converts model-space entities, with angles in degrees', () => {
    const doc = convertDwgDatabase(database());
    expect(doc.units).toBe(4);
    expect(doc.modelSpace.map((e) => e.type)).toEqual(['line', 'arc', 'unsupported']);
    const arc = doc.modelSpace[1];
    expect(arc?.type === 'arc' && [arc.startAngle, arc.endAngle]).toEqual([0, 90]);
  });

  it('reports entities it cannot convert and keeps their place', () => {
    const doc = convertDwgDatabase(database());
    expect(doc.unsupported).toEqual({ MULTILEADER: 1 });
    expect(doc.modelSpace[2]).toMatchObject({ type: 'unsupported', name: 'MULTILEADER' });
  });

  it('places the entities LibreDWG skipped in their space or block', () => {
    const db = database();
    db.tables.BLOCK_RECORD.entries.push(
      ...([
        { handle: '60', name: 'VALVE', basePoint: { x: 0, y: 0 }, flags: 64, entities: [] },
        { handle: '61', name: 'BORDER', basePoint: { x: 0, y: 0 }, flags: 4 | 64, entities: [] },
      ] as unknown as DwgDatabase['tables']['BLOCK_RECORD']['entries']),
    );
    const doc = convertDwgDatabase(db, {
      fromDwg: true,
      skipped: [
        { type: 'TRACE', owner: '1F', layer: 'PIPE' },
        { type: 'ACAD_PROXY_ENTITY', owner: '60', layer: '0' },
        { type: 'PDFUNDERLAY', owner: '50', layer: '0' },
        { type: 'MINSERT', owner: '', layer: '0' },
      ],
    });
    expect(doc.modelSpace.at(-1)).toMatchObject({
      type: 'unsupported',
      name: 'TRACE',
      layer: 'PIPE',
    });
    expect(doc.blocks.VALVE).toMatchObject({
      entities: [{ type: 'unsupported', name: 'ACAD_PROXY_ENTITY' }],
    });
    expect(doc.blocks.VALVE!.external).toBeUndefined();
    expect(doc.blocks.BORDER!.external).toBe(true);
    expect(doc.layouts[0]!.entities.at(-1)).toMatchObject({ name: 'PDFUNDERLAY' });
    // Every one is counted for the file, even one whose owner is unknown.
    expect(doc.unsupported).toEqual({
      MULTILEADER: 1,
      TRACE: 1,
      ACAD_PROXY_ENTITY: 1,
      PDFUNDERLAY: 1,
      MINSERT: 1,
    });
  });

  it('keeps polyline widths, so tapered arrowheads and thick lines are drawn', () => {
    const doc = convertDwgDatabase(
      modelSpace([
        {
          type: 'LWPOLYLINE',
          flag: 0,
          constantWidth: 0,
          vertices: [
            { x: 0, y: 0, bulge: 0, startWidth: 0, endWidth: 0 },
            { x: 40, y: 0, bulge: 0, startWidth: 3, endWidth: 0 },
            { x: 46, y: 0, bulge: 0 },
          ],
        },
        {
          type: 'LWPOLYLINE',
          flag: 0,
          constantWidth: 1.5,
          vertices: [
            { x: 0, y: 0, bulge: 0 },
            { x: 0, y: 40, bulge: 0 },
          ],
        },
        {
          type: 'POLYLINE2D',
          flag: 0,
          startWidth: 0.5,
          endWidth: 0.5,
          vertices: [
            { x: 0, y: 0, bulge: 0, startWidth: 2, endWidth: 0, flag: 0 },
            { x: 10, y: 0, bulge: 0, flag: 0 },
          ],
        },
      ]),
    );
    const vertices = doc.modelSpace.map((e) => (e.type === 'polyline' ? e.vertices : null));
    expect(vertices).toEqual([
      [
        { x: 0, y: 0, bulge: 0 },
        { x: 40, y: 0, bulge: 0, startWidth: 3 },
        { x: 46, y: 0, bulge: 0 },
      ],
      [
        { x: 0, y: 0, bulge: 0, startWidth: 1.5, endWidth: 1.5 },
        { x: 0, y: 40, bulge: 0, startWidth: 1.5, endWidth: 1.5 },
      ],
      [
        { x: 0, y: 0, bulge: 0, startWidth: 2 },
        { x: 10, y: 0, bulge: 0, startWidth: 0.5, endWidth: 0.5 },
      ],
    ]);
  });

  it('mirrors entities with a (0, 0, -1) extrusion into world coordinates', () => {
    const down = { x: 0, y: 0, z: -1 };
    const [arc, polyline, insert, plain] = convertDwgDatabase(
      modelSpace([
        {
          type: 'ARC',
          center: { x: 5, y: 1, z: 0 },
          radius: 1,
          startAngle: 0,
          endAngle: Math.PI / 2,
          extrusionDirection: down,
        },
        {
          type: 'LWPOLYLINE',
          flag: 0,
          vertices: [
            { x: 1, y: 2, bulge: 0.5 },
            { x: 3, y: 4, bulge: 0 },
          ],
          extrusionDirection: down,
        },
        {
          type: 'INSERT',
          name: 'B',
          insertionPoint: { x: 2, y: 3, z: 0 },
          xScale: 1,
          yScale: 1,
          rotation: Math.PI / 6,
          extrusionDirection: down,
          attribs: [
            {
              ...base,
              type: 'ATTRIB',
              flags: 0,
              text: {
                text: 'TAG',
                startPoint: { x: 4, y: 3 },
                textHeight: 2,
                rotation: 0,
                extrusionDirection: down,
              },
            },
          ],
        },
        // LibreDWG reports a polyline without a stored extrusion as (0, 0, 0).
        {
          type: 'LWPOLYLINE',
          flag: 0,
          vertices: [{ x: 1, y: 2, bulge: 0 }],
          extrusionDirection: { x: 0, y: 0, z: 0 },
        },
      ]),
    ).modelSpace;
    expect(arc).toMatchObject({ center: [-5, 1], startAngle: 90, endAngle: 180 });
    expect(polyline).toMatchObject({
      vertices: [
        { x: -1, y: 2, bulge: -0.5 },
        { x: -3, y: 4, bulge: -0 },
      ],
    });
    expect(insert).toMatchObject({ position: [-2, 3], scale: [-1, 1] });
    expect(insert?.type === 'insert' && insert.rotation).toBeCloseTo(-30, 9);
    expect(insert?.type === 'insert' && insert.attributes[0]).toMatchObject({
      position: [-4, 3],
      widthFactor: -1,
    });
    expect(plain).toMatchObject({ vertices: [{ x: 1, y: 2 }] });
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
