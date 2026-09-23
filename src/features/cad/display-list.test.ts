import { describe, expect, it } from 'vitest';
import { buildDisplayList, displayListText, listSpaces } from './display-list';
import { emptyCadDocument, type CadDocument, type CadEntity } from './model';

const MM = 72 / 25.4;
const base = { layer: '0', color: { kind: 'byLayer' } } as const;

function doc(entities: CadEntity[], extra: Partial<CadDocument> = {}): CadDocument {
  return {
    ...emptyCadDocument('test'),
    units: 4,
    layers: {
      '0': {
        name: '0',
        color: { kind: 'aci', index: 7 },
        lineType: 'CONTINUOUS',
        lineWeight: -3,
        visible: true,
      },
      PIPE: {
        name: 'PIPE',
        color: { kind: 'aci', index: 1 },
        lineType: 'CONTINUOUS',
        lineWeight: 0.5,
        visible: true,
      },
      HIDDEN: {
        name: 'HIDDEN',
        color: { kind: 'aci', index: 3 },
        lineType: 'CONTINUOUS',
        lineWeight: -3,
        visible: false,
      },
      INSTR: {
        name: 'INSTR',
        color: { kind: 'aci', index: 5 },
        lineType: 'DASHED',
        lineWeight: -3,
        visible: true,
      },
    },
    lineTypes: { DASHED: { name: 'DASHED', pattern: [6, -3] } },
    modelSpace: entities,
    ...extra,
  };
}

const strokes = (list: ReturnType<typeof buildDisplayList>) =>
  list.groups.flatMap((g) => g.strokes);

describe('CAD display list (DRW-02)', () => {
  it('maps millimetre model space to points, y down, with a margin', () => {
    const list = buildDisplayList(
      doc([{ ...base, type: 'line', start: [0, 0], end: [841, 594] }]),
      'Model',
    );
    const margin = 841 * MM * 0.02;
    expect(list.width).toBeCloseTo(841 * MM + 2 * margin, 1);
    const path = strokes(list)[0]!.paths[0]!;
    // (0,0) is the bottom-left corner in CAD, so it maps to the bottom of the drawing.
    expect(path[0]).toBeCloseTo(margin, 1);
    expect(path[1]).toBeCloseTo(594 * MM + margin, 1);
    expect(path[3]).toBeCloseTo(margin, 1);
  });

  it('resolves ByLayer colour, line weight and linetype; skips hidden layers', () => {
    const list = buildDisplayList(
      doc([
        { ...base, layer: 'PIPE', type: 'line', start: [0, 0], end: [100, 0] },
        { ...base, layer: 'HIDDEN', type: 'line', start: [0, 10], end: [100, 10] },
        { ...base, layer: 'INSTR', type: 'line', start: [0, 20], end: [100, 20] },
        {
          ...base,
          color: { kind: 'rgb', rgb: 0x123456 },
          type: 'line',
          start: [0, 30],
          end: [100, 30],
        },
      ]),
      'Model',
    );
    const batches = strokes(list);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toMatchObject({ color: 0xff0000, dash: null });
    expect(batches[0]!.width).toBeCloseTo(0.5 * MM, 1);
    expect(batches[1]!.color).toBe(0x0000ff);
    expect(batches[1]!.dash).toHaveLength(2);
    expect(batches[2]!.color).toBe(0x123456);
  });

  it('expands block references with rotation, scale, arrays, ByBlock colour and layer 0', () => {
    const valve: CadDocument['blocks'][string] = {
      name: 'VALVE',
      base: [0, 0],
      entities: [
        { layer: '0', color: { kind: 'byBlock' }, type: 'line', start: [0, 0], end: [10, 0] },
      ],
    };
    const list = buildDisplayList(
      doc(
        [
          {
            ...base,
            layer: 'PIPE',
            color: { kind: 'aci', index: 3 },
            type: 'insert',
            block: 'valve',
            position: [100, 100],
            scale: [2, 2],
            rotation: 90,
            columns: 2,
            rows: 1,
            columnSpacing: 50,
            rowSpacing: 0,
            attributes: [
              {
                ...base,
                type: 'text',
                position: [100, 80],
                height: 5,
                rotation: 0,
                widthFactor: 1,
                hAlign: 0,
                vAlign: 0,
                text: 'HV-101',
              },
            ],
          },
        ],
        { blocks: { VALVE: valve } },
      ),
      'Model',
    );
    const batch = strokes(list)[0]!;
    expect(batch.color).toBe(0x00ff00); // ByBlock takes the insert colour
    expect(batch.paths).toHaveLength(2); // two array columns
    const [x0, y0, x1, y1] = batch.paths[0]!;
    // Rotated 90° and scaled 2: the 10-unit line becomes 20 units vertical.
    expect(Math.abs(x1! - x0!)).toBeLessThan(0.01);
    expect(Math.abs(y1! - y0!)).toBeCloseTo(20 * MM * (list.width / list.width), 0);
    expect(displayListText(list).map((t) => t.text)).toEqual(['HV-101']);
    expect(list.stats.blocks).toBe(2);
  });

  it('turns circles, arcs and bulged polylines into smooth paths', () => {
    const list = buildDisplayList(
      doc([
        { ...base, type: 'circle', center: [50, 50], radius: 20 },
        { ...base, type: 'arc', center: [0, 0], radius: 10, startAngle: 0, endAngle: 90 },
        {
          ...base,
          type: 'polyline',
          closed: false,
          vertices: [
            { x: 0, y: 0, bulge: 1 },
            { x: 10, y: 0, bulge: 0 },
          ],
        },
      ]),
      'Model',
    );
    const [circle, arc, poly] = strokes(list)[0]!.paths;
    expect(circle!.length / 2).toBeGreaterThan(30);
    expect(arc!.length / 2).toBeGreaterThan(5);
    expect(poly!.length / 2).toBeGreaterThan(5);
  });

  it('fills solids and hatches; tints pattern hatches', () => {
    const list = buildDisplayList(
      doc([
        {
          ...base,
          type: 'solid',
          points: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        },
        {
          ...base,
          type: 'hatch',
          solid: false,
          pattern: 'ANSI31',
          loops: [
            [
              [20, 0],
              [30, 0],
              [30, 10],
            ],
          ],
        },
      ]),
      'Model',
    );
    const fills = list.groups[0]!.fills;
    expect(fills.map((f) => f.alpha)).toEqual([1, 0.18]);
  });

  it('lays out MTEXT lines from the attachment point', () => {
    const list = buildDisplayList(
      doc([
        {
          ...base,
          type: 'mtext',
          position: [0, 100],
          height: 2.5,
          rotation: 0,
          width: 50,
          attachment: 1,
          text: 'LINE ONE\\PLINE TWO',
          lineSpacing: 1,
        },
        { ...base, type: 'line', start: [0, 0], end: [100, 100] },
      ]),
      'Model',
    );
    const [one, two] = list.groups[0]!.texts;
    expect(one!.text).toBe('LINE ONE');
    expect(two!.y).toBeGreaterThan(one!.y); // second line is lower on the sheet
    expect(one!.d).toBeLessThan(0); // "up" points up the sheet (negative y)
  });

  it('renders a paper-space layout at paper size with clipped viewports onto model space', () => {
    const cad = doc([{ ...base, type: 'line', start: [0, 0], end: [1000, 0] }], {
      layouts: [
        {
          name: 'A1 Sheet',
          tabOrder: 1,
          limits: { min: [0, 0], max: [841, 594] },
          entities: [
            {
              ...base,
              type: 'polyline',
              closed: true,
              vertices: [
                { x: 10, y: 10, bulge: 0 },
                { x: 831, y: 10, bulge: 0 },
                { x: 831, y: 584, bulge: 0 },
                { x: 10, y: 584, bulge: 0 },
              ],
            },
            {
              ...base,
              type: 'viewport',
              id: 1,
              center: [420, 297],
              width: 841,
              height: 594,
              viewCenter: [0, 0],
              viewHeight: 1,
              twist: 0,
              frozenLayers: [],
              on: true,
            },
            {
              ...base,
              type: 'viewport',
              id: 2,
              center: [400, 300],
              width: 600,
              height: 400,
              viewCenter: [500, 0],
              viewHeight: 800,
              twist: 0,
              frozenLayers: [],
              on: true,
            },
          ],
        },
      ],
    });
    expect(listSpaces(cad)).toEqual([
      { name: 'Model', entities: 1, viewports: 0 },
      { name: 'A1 Sheet', entities: 3, viewports: 1 },
    ]);
    const list = buildDisplayList(cad, 'A1 Sheet');
    expect(list.width).toBeCloseTo(841 * MM, 0);
    expect(list.height).toBeCloseTo(594 * MM, 0);
    const clipped = list.groups.find((g) => g.clip);
    expect(clipped).toBeDefined();
    const line = clipped!.strokes[0]!.paths[0]!;
    // 1000 model units at k = 400/800 → 500 paper mm.
    expect((line[2]! - line[0]!) / MM).toBeCloseTo(500, 0);
    expect(() => buildDisplayList(cad, 'Missing')).toThrow(/not found/);
  });
});
