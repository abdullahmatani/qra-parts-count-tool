import { describe, expect, it } from 'vitest';
import type { CadEntity, CadLayout, Vec2 } from '../model';
import { parseDxf } from './parse-dxf';

/**
 * DXF text from a compact notation: "code value" pairs, separated by " | " or
 * line breaks. A value may contain single spaces; a pair without one has an
 * empty value.
 */
function dxf(source: string, newline = '\n'): string {
  const lines: string[] = [];
  for (const pair of source.split(/\n| \| /)) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(' ');
    lines.push(space < 0 ? trimmed : trimmed.slice(0, space));
    lines.push(space < 0 ? '' : trimmed.slice(space + 1));
  }
  return lines.join(newline) + newline;
}

/** A DXF file with the given sections' contents (keyed by section name). */
function file(sections: Record<string, string>): string {
  let body = '';
  for (const [name, content] of Object.entries(sections)) {
    body += `0 SECTION | 2 ${name}\n${content}\n0 ENDSEC\n`;
  }
  return dxf(`${body}0 EOF`);
}

/** Model-space entities of a file that has only an ENTITIES section. */
function parseEntities(entities: string): CadEntity[] {
  return parseDxf(file({ ENTITIES: entities })).modelSpace;
}

function only<T extends CadEntity['type']>(
  entities: CadEntity[],
  type: T,
): Extract<CadEntity, { type: T }> {
  expect(entities).toHaveLength(1);
  const entity = entities[0]!;
  expect(entity.type).toBe(type);
  return entity as Extract<CadEntity, { type: T }>;
}

const near = (points: Vec2[], x: number, y: number) =>
  points.some(([px, py]) => Math.abs(px - x) < 1e-9 && Math.abs(py - y) < 1e-9);

const BY_LAYER = { kind: 'byLayer' };

describe('parseDxf: file structure', () => {
  it('reads the header variables', () => {
    const doc = parseDxf(
      file({
        HEADER: `
          9 $ACADVER | 1 AC1032
          9 $EXTMIN | 10 1 | 20 2 | 30 0
          9 $INSUNITS | 70 4
          9 $LTSCALE | 40 2.5`,
      }),
    );
    expect(doc.source).toBe('dxf');
    expect(doc.version).toBe('AC1032');
    expect(doc.units).toBe(4);
    expect(doc.ltScale).toBe(2.5);
  });

  it('defaults the header values and always has layer 0', () => {
    const doc = parseDxf(file({ HEADER: '9 $ACADVER | 1 AC1015' }));
    expect(doc.units).toBe(0);
    expect(doc.ltScale).toBe(1);
    expect(doc.layers['0']).toEqual({
      name: '0',
      color: { kind: 'aci', index: 7 },
      lineType: 'CONTINUOUS',
      lineWeight: -3,
      visible: true,
    });
  });

  it('skips unknown sections, tables and objects', () => {
    const doc = parseDxf(
      file({
        CLASSES: '0 CLASS | 1 ACDBDICTIONARYWDFLT | 2 AcDbDictionary',
        THUMBNAILIMAGE: '90 3 | 310 DEADBEEF',
        TABLES: '0 TABLE | 2 STYLE\n0 STYLE | 2 Standard\n0 ENDTAB',
        ENTITIES: '0 LINE | 10 0 | 20 0 | 11 1 | 21 1',
        OBJECTS: '0 DICTIONARY | 3 ACAD_GROUP\n0 XRECORD | 10 5',
        ACDSDATA: '0 ACDSSCHEMA | 90 0',
      }),
    );
    expect(doc.modelSpace).toHaveLength(1);
    expect(doc.layouts).toEqual([]);
  });

  it('reads CRLF files with padded codes and blanks around values', () => {
    const lines = [
      ...['  0', 'SECTION', '  2', 'TABLES', '  0', 'TABLE', '  2', 'LAYER'],
      ...['  0', 'LAYER', '  2', 'Pipes  ', ' 70', '     0', ' 62', '     3', '  0', 'ENDTAB'],
      ...['  0', 'ENDSEC', '  0', 'SECTION', '  2', 'ENTITIES'],
      ...['  0', 'LINE', '  8', 'Pipes ', ' 10', ' 1.5', ' 20', '2.0 ', ' 11', '3', ' 21', '4'],
      ...['  0', 'MTEXT', ' 10', '0', ' 20', '0', ' 40', '1', '  3', 'split ', '  1', ' text '],
      ...['  0', 'ENDSEC', '  0', 'EOF'],
    ];
    const doc = parseDxf(lines.join('\r\n') + '\r\n');
    expect(doc.layers.Pipes?.color).toEqual({ kind: 'aci', index: 3 });
    const [line, mtext] = doc.modelSpace;
    expect(line).toMatchObject({ layer: 'Pipes', start: [1.5, 2], end: [3, 4] });
    // Text values keep their blanks: MTEXT chunks may be split next to a space.
    expect(mtext).toMatchObject({ type: 'mtext', text: 'split  text ' });
  });

  it('throws for text that is not DXF', () => {
    expect(() => parseDxf('')).toThrow(/Not a DXF file/);
    expect(() => parseDxf('hello\nworld\n')).toThrow(/Not a DXF file/);
    expect(() => parseDxf('%PDF-1.7\n1 0 obj\n')).toThrow(/Not a DXF file/);
  });

  it('throws for binary DXF', () => {
    expect(() => parseDxf('AutoCAD Binary DXF\r\n\u001a\u0000\u0000\u0000SECTION')).toThrow(
      'Binary DXF is not supported',
    );
  });
});

describe('parseDxf: tables', () => {
  const TABLES = `
    0 TABLE | 2 LTYPE | 70 2
    0 LTYPE | 5 14 | 2 Continuous | 70 0 | 3 Solid line | 72 65 | 73 0 | 40 0
    0 LTYPE | 2 Dashed | 70 0 | 3 __ __ | 72 65 | 73 3 | 40 0.75
    49 0.5 | 74 0 | 49 -0.25 | 74 0 | 49 0 | 74 0
    0 ENDTAB
    0 TABLE | 2 LAYER | 70 5
    0 LAYER | 5 A1 | 2 Walls | 70 0 | 62 1 | 6 Dashed | 370 25
    0 LAYER | 5 A2 | 2 Off | 70 0 | 62 -3 | 6 Continuous
    0 LAYER | 5 A3 | 2 Frozen | 70 1 | 62 5 | 6 Continuous
    0 LAYER | 5 A4 | 2 True | 70 0 | 62 1 | 420 ${0x123456} | 370 -3
    0 LAYER | 5 A5 | 2 Plain
    0 ENDTAB`;

  it('reads layers', () => {
    const { layers } = parseDxf(file({ TABLES }));
    expect(layers.Walls).toEqual({
      name: 'Walls',
      color: { kind: 'aci', index: 1 },
      lineType: 'Dashed',
      lineWeight: 0.25,
      visible: true,
    });
    expect(layers.Off).toMatchObject({ color: { kind: 'aci', index: 3 }, visible: false });
    expect(layers.Frozen).toMatchObject({ color: { kind: 'aci', index: 5 }, visible: false });
    expect(layers.True).toMatchObject({
      color: { kind: 'rgb', rgb: 0x123456 },
      lineWeight: -3,
      visible: true,
    });
    expect(layers.Plain).toEqual({
      name: 'Plain',
      color: { kind: 'aci', index: 7 },
      lineType: 'CONTINUOUS',
      lineWeight: -3,
      visible: true,
    });
    expect(layers['0']).toBeDefined();
  });

  it('reads linetype patterns under their name and the upper-case name', () => {
    const { lineTypes } = parseDxf(file({ TABLES }));
    expect(lineTypes.Dashed).toEqual({ name: 'Dashed', pattern: [0.5, -0.25, 0] });
    expect(lineTypes.DASHED).toEqual(lineTypes.Dashed);
    expect(lineTypes.Continuous?.pattern).toEqual([]);
    expect(lineTypes.CONTINUOUS).toBeDefined();
  });

  it('reads viewports and resolves their frozen layers through layer handles', () => {
    const doc = parseDxf(
      file({
        TABLES,
        ENTITIES: `
          0 VIEWPORT | 67 1 | 10 150 | 20 100 | 40 200 | 41 120 | 68 1 | 69 2
          12 500 | 22 400 | 45 60 | 51 15 | 331 a1 | 331 FF
          0 VIEWPORT | 67 1 | 10 0 | 20 0 | 40 10 | 41 10 | 68 0 | 69 3
          0 VIEWPORT | 67 1 | 10 0 | 20 0 | 40 10 | 41 10 | 68 -1 | 69 4`,
      }),
    );
    expect(doc.layouts).toHaveLength(1);
    const [viewport, off, offScreen] = doc.layouts[0]!.entities;
    expect(viewport).toEqual({
      layer: '0',
      color: BY_LAYER,
      type: 'viewport',
      center: [150, 100],
      width: 200,
      height: 120,
      viewCenter: [500, 400],
      viewHeight: 60,
      twist: 15,
      id: 2,
      frozenLayers: ['Walls', 'FF'],
      on: true,
    });
    expect(off).toMatchObject({ id: 3, on: false, frozenLayers: [] });
    expect(offScreen).toMatchObject({ id: 4, on: false });
  });
});

describe('parseDxf: entities', () => {
  it('reads lines, circles and arcs with their style', () => {
    const entities = parseEntities(`
      0 LINE | 8 Walls | 10 0 | 20 1 | 30 0 | 11 10 | 21 11 | 31 0
      0 CIRCLE | 8 A | 62 0 | 6 BYLAYER | 370 -1 | 10 5 | 20 6 | 40 2
      0 ARC | 62 3 | 6 Dashed | 370 50 | 48 2 | 10 1 | 20 2 | 40 3 | 50 10 | 51 200
      0 LINE | 62 1 | 420 ${0xff8000} | 370 -2 | 10 0 | 20 0 | 11 1 | 21 0`);
    expect(entities).toEqual([
      { layer: 'Walls', color: BY_LAYER, type: 'line', start: [0, 1], end: [10, 11] },
      { layer: 'A', color: { kind: 'byBlock' }, type: 'circle', center: [5, 6], radius: 2 },
      {
        layer: '0',
        color: { kind: 'aci', index: 3 },
        lineType: 'Dashed',
        lineWeight: 0.5,
        lineTypeScale: 2,
        type: 'arc',
        center: [1, 2],
        radius: 3,
        startAngle: 10,
        endAngle: 200,
      },
      {
        layer: '0',
        color: { kind: 'rgb', rgb: 0xff8000 },
        lineWeight: -2,
        type: 'line',
        start: [0, 0],
        end: [1, 0],
      },
    ]);
  });

  it('skips invisible entities', () => {
    const entities = parseEntities(`
      0 LINE | 60 1 | 10 0 | 20 0 | 11 1 | 21 1
      0 POINT | 10 3 | 20 4 | 30 5`);
    expect(entities).toEqual([{ layer: '0', color: BY_LAYER, type: 'point', position: [3, 4] }]);
  });

  it('reads LWPOLYLINE vertices, bulges and the closed flag', () => {
    const polyline = only(
      parseEntities(`
        0 LWPOLYLINE | 8 P | 90 3 | 70 1 | 43 0
        10 0 | 20 0
        10 10 | 20 0 | 40 1 | 41 1 | 42 1
        10 10 | 20 10`),
      'polyline',
    );
    expect(polyline.closed).toBe(true);
    expect(polyline.vertices).toEqual([
      { x: 0, y: 0, bulge: 0 },
      { x: 10, y: 0, bulge: 1 },
      { x: 10, y: 10, bulge: 0 },
    ]);
  });

  it('reads legacy POLYLINE/VERTEX/SEQEND and skips meshes', () => {
    const doc = parseDxf(
      file({
        ENTITIES: `
          0 POLYLINE | 8 P | 66 1 | 10 0 | 20 0 | 30 0 | 70 1
          0 VERTEX | 8 P | 10 1 | 20 2 | 42 0.5
          0 VERTEX | 8 P | 10 9 | 20 9 | 70 16
          0 VERTEX | 8 P | 10 3 | 20 4
          0 SEQEND | 8 P
          0 POLYLINE | 66 1 | 70 64 | 71 3 | 72 1
          0 VERTEX | 10 0 | 20 0 | 70 192
          0 VERTEX | 70 128 | 71 1 | 72 2 | 73 3
          0 SEQEND
          0 LINE | 10 0 | 20 0 | 11 1 | 21 1`,
      }),
    );
    expect(doc.modelSpace.map((e) => e.type)).toEqual(['polyline', 'line']);
    expect(doc.modelSpace[0]).toEqual({
      layer: 'P',
      color: BY_LAYER,
      type: 'polyline',
      vertices: [
        { x: 1, y: 2, bulge: 0.5 },
        { x: 3, y: 4, bulge: 0 },
      ],
      closed: true,
    });
    expect(doc.unsupported).toEqual({ 'POLYLINE (mesh)': 1 });
  });

  it('reads ellipses and splines', () => {
    const [ellipse, spline] = parseEntities(`
      0 ELLIPSE | 10 1 | 20 2 | 11 4 | 21 0 | 40 0.5 | 41 0 | 42 3
      0 SPLINE | 70 2 | 71 2 | 72 6 | 73 3 | 74 2 | 42 1e-9 | 43 1e-10
      40 0 | 40 0 | 40 0 | 40 1 | 40 1 | 40 1 | 41 1 | 41 0.5 | 41 1
      10 0 | 20 0 | 10 1 | 20 1 | 10 2 | 20 0 | 11 0 | 21 0 | 11 2 | 21 0`);
    expect(ellipse).toMatchObject({
      type: 'ellipse',
      center: [1, 2],
      majorAxis: [4, 0],
      ratio: 0.5,
      startParam: 0,
      endParam: 3,
    });
    expect(spline).toMatchObject({
      type: 'spline',
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      weights: [1, 0.5, 1],
      controlPoints: [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      fitPoints: [
        [0, 0],
        [2, 0],
      ],
      closed: true,
    });
  });

  it('reads TEXT with alignment and decodes control codes', () => {
    const [aligned, plain] = parseEntities(`
      0 TEXT | 8 T | 100 AcDbText | 10 1 | 20 2 | 40 2.5
      1 %%c50 %%d %%p0.1 100%%% %%uU\\U+00B2 %%065
      50 30 | 41 0.8 | 72 1 | 11 5 | 21 6 | 100 AcDbText | 73 2
      0 TEXT | 10 0 | 20 0 | 40 1 | 1 plain \\P text`);
    expect(aligned).toEqual({
      layer: 'T',
      color: BY_LAYER,
      type: 'text',
      position: [1, 2],
      alignPoint: [5, 6],
      height: 2.5,
      rotation: 30,
      widthFactor: 0.8,
      hAlign: 1,
      vAlign: 2,
      text: 'Ø50 ° ±0.1 100% U² A',
    });
    expect(plain).toMatchObject({ rotation: 0, widthFactor: 1, hAlign: 0, vAlign: 0 });
    expect(plain).not.toHaveProperty('alignPoint');
    expect(plain).toHaveProperty('text', 'plain \\P text');
  });

  it('reads MTEXT, joining 3 and 1 chunks, with rotation from 50 or the direction', () => {
    const [byDirection, byAngle, columns] = parseEntities(`
      0 MTEXT | 10 1 | 20 2 | 40 3.5 | 41 100 | 71 5
      3 Hello {\\fArial;big}_ | 3 wide_ | 1 world\\P\\U+00B0 \\\\U+0041
      11 0 | 21 1 | 44 1.5
      0 MTEXT | 10 0 | 20 0 | 40 1 | 1 x | 50 30 | 11 1 | 21 1
      0 MTEXT | 1 y | 50 12 | 75 2 | 76 2 | 48 50 | 49 5 | 50 7 | 50 8`);
    expect(byDirection).toEqual({
      layer: '0',
      color: BY_LAYER,
      type: 'mtext',
      position: [1, 2],
      height: 3.5,
      rotation: 90,
      width: 100,
      attachment: 5,
      text: 'Hello {\\fArial;big}_wide_world\\P° \\\\U+0041',
      lineSpacing: 1.5,
    });
    expect(byAngle).toMatchObject({ rotation: 30, attachment: 1, lineSpacing: 1, width: 0 });
    // Column data after 75 reuses 48 and 50.
    expect(columns).toMatchObject({ rotation: 12, text: 'y' });
    expect(columns).not.toHaveProperty('lineTypeScale');
  });

  it('reads INSERT arrays with their visible ATTRIBs', () => {
    const entities = parseEntities(`
      0 INSERT | 8 Valves | 66 1 | 2 VALVE | 10 5 | 20 6 | 41 2 | 42 3 | 43 1 | 50 45
      70 3 | 71 2 | 44 10 | 45 20
      0 ATTRIB | 8 Tags | 100 AcDbText | 10 7 | 20 8 | 40 2.5 | 1 V-101 | 72 1 | 11 9 | 21 8
      100 AcDbAttribute | 2 TAG | 70 0 | 73 7 | 74 2
      0 ATTRIB | 10 0 | 20 0 | 40 1 | 1 hidden | 2 H | 70 1
      0 SEQEND
      0 LINE | 10 0 | 20 0 | 11 1 | 21 1`);
    expect(entities.map((e) => e.type)).toEqual(['insert', 'line']);
    expect(entities[0]).toEqual({
      layer: 'Valves',
      color: BY_LAYER,
      type: 'insert',
      block: 'VALVE',
      position: [5, 6],
      scale: [2, 3],
      rotation: 45,
      columns: 3,
      rows: 2,
      columnSpacing: 10,
      rowSpacing: 20,
      attributes: [
        {
          layer: 'Tags',
          color: BY_LAYER,
          type: 'text',
          position: [7, 8],
          alignPoint: [9, 8],
          height: 2.5,
          rotation: 0,
          widthFactor: 1,
          hAlign: 1,
          vAlign: 2,
          text: 'V-101',
        },
      ],
    });
  });

  it('defaults INSERT scale and array counts', () => {
    const insert = only(parseEntities('0 INSERT | 2 B | 10 1 | 20 1'), 'insert');
    expect(insert).toMatchObject({
      scale: [1, 1],
      rotation: 0,
      columns: 1,
      rows: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attributes: [],
    });
  });

  it('reorders SOLID and TRACE corners into drawing order', () => {
    const [quad, triangle, trace] = parseEntities(`
      0 SOLID | 10 0 | 20 0 | 11 1 | 21 0 | 12 0 | 22 1 | 13 1 | 23 1
      0 SOLID | 10 0 | 20 0 | 11 1 | 21 0 | 12 0 | 22 1 | 13 0 | 23 1
      0 TRACE | 10 0 | 20 0 | 11 2 | 21 0 | 12 0 | 22 2`);
    expect(quad).toMatchObject({
      type: 'solid',
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    });
    expect(triangle).toMatchObject({
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    });
    expect(trace).toMatchObject({
      type: 'solid',
      points: [
        [0, 0],
        [2, 0],
        [0, 2],
      ],
    });
  });

  it('reads DIMENSION, LEADER and POINT', () => {
    const [dimension, leader, arrowed, point] = parseEntities(`
      0 DIMENSION | 8 Dims | 2 *D1 | 10 5 | 20 5 | 70 32 | 3 Standard
      0 LEADER | 3 Standard | 71 0 | 72 0 | 76 2 | 10 0 | 20 0 | 10 5 | 20 0
      0 LEADER | 71 1 | 76 1 | 10 0 | 20 0
      0 POINT | 10 1 | 20 2 | 30 3`);
    expect(dimension).toEqual({ layer: 'Dims', color: BY_LAYER, type: 'dimension', block: '*D1' });
    expect(leader).toMatchObject({
      type: 'leader',
      points: [
        [0, 0],
        [5, 0],
      ],
      arrow: false,
    });
    expect(arrowed).toMatchObject({ type: 'leader', arrow: true });
    expect(point).toMatchObject({ type: 'point', position: [1, 2] });
  });

  it('reads WIPEOUT clip rectangles and polygons into world coordinates', () => {
    const [rectangle, polygon] = parseEntities(`
      0 WIPEOUT | 100 AcDbWipeout | 90 0 | 10 100 | 20 200 | 11 50 | 21 0 | 12 0 | 22 20
      13 1 | 23 1 | 71 1 | 91 2 | 14 -0.5 | 24 -0.5 | 14 0.5 | 24 0.5
      0 WIPEOUT | 10 0 | 20 0 | 11 10 | 21 0 | 12 0 | 22 10 | 71 2 | 91 3
      14 -0.5 | 24 -0.5 | 14 0.5 | 24 -0.5 | 14 -0.5 | 24 0.5`);
    expect(rectangle).toMatchObject({
      type: 'wipeout',
      points: [
        [100, 220],
        [150, 220],
        [150, 200],
        [100, 200],
      ],
    });
    // Image y runs down: (-0.5, -0.5) is the top-left corner.
    expect(polygon).toMatchObject({
      points: [
        [0, 10],
        [10, 10],
        [0, 0],
      ],
    });
  });

  it('counts unsupported entities and carries on', () => {
    const doc = parseDxf(
      file({
        ENTITIES: `
          0 3DFACE | 10 0 | 20 0 | 11 1 | 21 0 | 12 1 | 22 1
          0 MLINE | 2 STANDARD | 10 0 | 20 0
          0 3DFACE | 10 0 | 20 0
          0 ATTDEF | 10 0 | 20 0 | 1 default | 2 TAG
          0 LINE | 10 0 | 20 0 | 11 1 | 21 1`,
      }),
    );
    expect(doc.modelSpace.map((e) => e.type)).toEqual(['line']);
    expect(doc.unsupported).toEqual({ '3DFACE': 2, MLINE: 1 });
  });

  it('mirrors entities with a (0, 0, -1) extrusion into world coordinates', () => {
    const [arc, polyline, insert] = parseEntities(`
      0 ARC | 10 5 | 20 1 | 40 1 | 210 0 | 220 0 | 230 -1 | 50 0 | 51 90
      0 LWPOLYLINE | 70 0 | 10 1 | 20 2 | 42 0.5 | 10 3 | 20 4 | 230 -1
      0 INSERT | 2 B | 10 2 | 20 3 | 50 30 | 230 -1`);
    expect(arc).toMatchObject({ center: [-5, 1], startAngle: 90, endAngle: 180 });
    expect(polyline).toMatchObject({
      vertices: [
        { x: -1, y: 2, bulge: -0.5 },
        { x: -3, y: 4, bulge: -0 },
      ],
    });
    expect(insert).toMatchObject({ position: [-2, 3], rotation: -30, scale: [-1, 1] });
  });
});

describe('parseDxf: hatches', () => {
  it('reads polyline and edge paths by their counts, not the seed points', () => {
    const hatch = only(
      parseEntities(`
        0 HATCH | 8 Fill | 100 AcDbHatch | 10 0 | 20 0 | 30 0 | 210 0 | 220 0 | 230 1
        2 ANSI31 | 70 0 | 71 1 | 91 2
        92 7 | 72 1 | 73 1 | 93 3 | 10 0 | 20 0 | 42 0 | 10 10 | 20 0 | 42 1 | 10 10 | 20 10 | 42 0
        97 1 | 330 ABC
        92 1 | 93 2
        72 1 | 10 0 | 20 0 | 11 10 | 21 0
        72 2 | 10 5 | 20 0 | 40 5 | 50 0 | 51 180 | 73 1
        97 0
        75 1 | 76 1 | 52 0 | 41 1 | 77 0 | 78 1
        53 45 | 43 0 | 44 0 | 45 -2.2 | 46 2.2 | 79 0
        47 0.5 | 98 1 | 10 999 | 20 999`),
      'hatch',
    );
    expect(hatch).toMatchObject({ layer: 'Fill', solid: false, pattern: 'ANSI31' });
    expect(hatch.loops).toHaveLength(2);
    expect(hatch.loops.some((loop) => near(loop, 999, 999))).toBe(false);

    // Polyline path with a semicircular bulge from (10, 0) to (10, 10): three
    // vertices and the 15 interior points of the 180° arc (8 segments per 90°).
    const [polyline, edges] = hatch.loops as [Vec2[], Vec2[]];
    expect(polyline).toHaveLength(18);
    expect(polyline.slice(0, 2)).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(near(polyline, 15, 5)).toBe(true);
    expect(polyline[17]).toEqual([10, 10]);

    // Edge path: a line (2 points) and a half circle back to the start (16 more).
    expect(edges).toHaveLength(18);
    expect(edges.slice(0, 2)).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(near(edges, 5, 5)).toBe(true);
    expect(edges[17]![0]).toBeCloseTo(0);
    expect(edges[17]![1]).toBeCloseTo(0);
  });

  it('reads clockwise arcs, elliptic arcs and spline edges', () => {
    const hatch = only(
      parseEntities(`
        0 HATCH | 2 SOLID | 70 1 | 91 3
        92 0 | 93 1 | 72 2 | 10 0 | 20 0 | 40 1 | 50 0 | 51 90 | 73 0 | 97 0
        92 0 | 93 1 | 72 3 | 10 0 | 20 0 | 11 2 | 21 0 | 40 0.5 | 50 0 | 51 90 | 73 1 | 97 0
        92 0 | 93 1 | 72 4 | 94 3 | 73 0 | 74 0 | 95 8 | 96 4
        40 0 | 40 0 | 40 0 | 40 0 | 40 1 | 40 1 | 40 1 | 40 1
        10 0 | 20 0 | 10 1 | 20 2 | 10 3 | 20 2 | 10 4 | 20 0 | 97 0
        97 1 | 330 AA
        75 0 | 76 1 | 98 0`),
      'hatch',
    );
    expect(hatch.solid).toBe(true);
    expect(hatch.pattern).toBe('SOLID');
    const [clockwise, elliptic, spline] = hatch.loops as [Vec2[], Vec2[], Vec2[]];
    // Clockwise from 0° to -90°.
    expect(clockwise).toHaveLength(9);
    expect(clockwise[0]).toEqual([1, 0]);
    expect(clockwise[4]![0]).toBeCloseTo(Math.SQRT1_2);
    expect(clockwise[4]![1]).toBeCloseTo(-Math.SQRT1_2);
    expect(clockwise[8]![0]).toBeCloseTo(0);
    expect(clockwise[8]![1]).toBeCloseTo(-1);
    // Quarter ellipse from the major axis end (2, 0) to the minor axis end (0, 1).
    expect(elliptic[0]).toEqual([2, 0]);
    expect(elliptic.at(-1)![0]).toBeCloseTo(0);
    expect(elliptic.at(-1)![1]).toBeCloseTo(1);
    // Spline edges are approximated by their control points.
    expect(spline).toEqual([
      [0, 0],
      [1, 2],
      [3, 2],
      [4, 0],
    ]);
  });
});

describe('parseDxf: blocks and layouts', () => {
  it('reads block definitions but not the space containers', () => {
    const doc = parseDxf(
      file({
        BLOCKS: `
          0 BLOCK | 8 0 | 2 *Model_Space | 70 0 | 10 0 | 20 0
          0 ENDBLK | 8 0
          0 BLOCK | 8 0 | 2 *Paper_Space | 70 0 | 10 0 | 20 0
          0 ENDBLK | 8 0
          0 BLOCK | 8 0 | 2 VALVE | 70 2 | 10 1 | 20 2 | 30 0 | 3 VALVE
          0 LINE | 10 0 | 20 0 | 11 2 | 21 0
          0 ATTDEF | 10 0 | 20 0 | 40 1 | 1 | 3 Tag? | 2 TAG | 70 0
          0 CIRCLE | 62 0 | 10 1 | 20 0 | 40 1
          0 ENDBLK | 8 0`,
      }),
    );
    expect(Object.keys(doc.blocks)).toEqual(['VALVE']);
    expect(doc.blocks.VALVE!.base).toEqual([1, 2]);
    expect(doc.blocks.VALVE!.entities.map((e) => e.type)).toEqual(['line', 'circle']);
    expect(doc.modelSpace).toEqual([]);
    expect(doc.layouts).toEqual([]);
  });

  /** A LAYOUT object; `layout` holds the groups after the AcDbLayout marker. */
  const layoutObject = (handle: string, layout: string) => `
    0 LAYOUT | 5 ${handle} | 102 {ACAD_REACTORS | 330 1A | 102 } | 330 1A
    100 AcDbPlotSettings | 1 Page setup | 2 none_device | 40 6.35 | 41 6.35 | 44 297 | 45 210
    70 688 | 100 AcDbLayout | ${layout}`;

  it('assigns paper-space entities to layouts through their block records', () => {
    const doc = parseDxf(
      file({
        TABLES: `
          0 TABLE | 2 BLOCK_RECORD
          0 BLOCK_RECORD | 5 1F | 100 AcDbBlockTableRecord | 2 *Model_Space
          0 BLOCK_RECORD | 5 1E | 100 AcDbBlockTableRecord | 2 *Paper_Space
          0 BLOCK_RECORD | 5 22 | 100 AcDbBlockTableRecord | 2 *Paper_Space0
          0 ENDTAB`,
        BLOCKS: `
          0 BLOCK | 5 20 | 330 1F | 2 *Model_Space | 10 0 | 20 0
          0 ENDBLK
          0 BLOCK | 5 1C | 330 1E | 2 *Paper_Space | 10 0 | 20 0
          0 ENDBLK
          0 BLOCK | 5 23 | 330 22 | 2 *Paper_Space0 | 10 0 | 20 0
          0 LINE | 330 22 | 67 1 | 10 1 | 20 1 | 11 2 | 21 2
          0 VIEWPORT | 330 22 | 67 1 | 10 100 | 20 100 | 68 0 | 69 0
          0 ENDBLK`,
        ENTITIES: `
          0 LINE | 330 1F | 10 0 | 20 0 | 11 1 | 21 1
          0 CIRCLE | 330 1E | 67 1 | 10 5 | 20 5 | 40 1
          0 TEXT | 67 1 | 410 sheet b | 10 0 | 20 0 | 40 2.5 | 1 B`,
        OBJECTS: `
          0 DICTIONARY | 5 1A | 3 Model | 350 2A
          ${layoutObject('2A', '1 Model | 70 1 | 71 0 | 330 1F')}
          ${layoutObject('2B', '1 Sheet A | 70 1 | 71 2 | 10 0 | 20 0 | 11 297 | 21 210 | 340 1E')}
          ${layoutObject('2C', '1 Sheet B | 71 1 | 10 -5 | 20 -5 | 11 415 | 21 292 | 330 22')}`,
      }),
    );
    expect(Object.keys(doc.blocks)).toEqual([]);
    expect(doc.modelSpace.map((e) => e.type)).toEqual(['line']);
    expect(doc.layouts.map((l) => [l.name, l.tabOrder])).toEqual([
      ['Sheet B', 1],
      ['Sheet A', 2],
    ]);
    const [sheetB, sheetA] = doc.layouts as [CadLayout, CadLayout];
    // Sheet B: its *Paper_Space0 block, plus the entity whose 410 names it.
    expect(sheetB.entities.map((e) => e.type)).toEqual(['line', 'viewport', 'text']);
    expect(sheetB.limits).toEqual({ min: [-5, -5], max: [415, 292] });
    // Sheet A is the active layout (*Paper_Space): it gets 67 = 1 entities without 410.
    expect(sheetA.entities.map((e) => e.type)).toEqual(['circle']);
    expect(sheetA.limits).toEqual({ min: [0, 0], max: [297, 210] });
  });

  it('puts paper-space entities of files without LAYOUT objects in Layout1', () => {
    const doc = parseDxf(
      file({
        ENTITIES: `
          0 LINE | 10 0 | 20 0 | 11 1 | 21 1
          0 LINE | 67 1 | 10 0 | 20 0 | 11 5 | 21 5`,
      }),
    );
    expect(doc.modelSpace).toHaveLength(1);
    expect(doc.layouts).toHaveLength(1);
    expect(doc.layouts[0]).toMatchObject({ name: 'Layout1', tabOrder: 1 });
    expect(doc.layouts[0]!.entities).toHaveLength(1);
  });
});
