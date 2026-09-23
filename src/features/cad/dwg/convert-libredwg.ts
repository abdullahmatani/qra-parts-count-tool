/**
 * Converts the database produced by LibreDWG (via @mlightcad/libredwg-web) into
 * the app's neutral CAD model. This module runs only inside the DWG reader
 * worker (see dwg.worker.ts), which is the licence boundary around the
 * GPL-licensed LibreDWG: everything that leaves the worker is plain data in the
 * neutral model.
 *
 * LibreDWG reports angles in radians; the neutral model uses degrees for
 * rotations and arc angles.
 */
import type {
  DwgDatabase,
  DwgEntity,
  DwgHatchEntity,
  DwgInsertEntity,
  DwgTextBase,
} from '@mlightcad/libredwg-web';
import {
  BY_BLOCK,
  BY_LAYER,
  emptyCadDocument,
  type CadColor,
  type CadDocument,
  type CadEntity,
  type CadStyle,
  type Vec2,
} from '../model';
import { arcPoints, bulgePoints, ellipsePoints, splinePoints } from '../geometry';
import { decodePercentCodes } from '../text-codes';

const DEG = 180 / Math.PI;

/** DWG line weight enumeration (indices 0–23) in hundredths of a millimetre. */
const DWG_LINEWEIGHTS = [
  0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200,
  211,
];

type Point = { x: number; y: number };
const v2 = (p: Point | undefined): Vec2 => [p?.x ?? 0, p?.y ?? 0];

/** Converts a line weight from DWG (enum) or DXF (1/100 mm) encoding to the model (mm). */
export function lineWeightToMm(value: number | undefined, fromDwg: boolean): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (fromDwg) {
    if (value >= 0 && value < DWG_LINEWEIGHTS.length) return DWG_LINEWEIGHTS[value]! / 100;
    if (value === 29 || value === 28) return undefined; // ByLayer
    if (value === 30) return -2; // ByBlock
    return -3; // Default
  }
  if (value === -1) return undefined;
  if (value < 0) return value;
  return value / 100;
}

function colorOf(entity: { colorIndex?: number; color?: number }): CadColor {
  const index = entity.colorIndex;
  if (index === 256 || index === undefined) {
    return entity.color !== undefined && index === undefined
      ? { kind: 'rgb', rgb: entity.color }
      : BY_LAYER;
  }
  if (index === 0) return BY_BLOCK;
  if (index >= 1 && index <= 255) return { kind: 'aci', index };
  return entity.color !== undefined ? { kind: 'rgb', rgb: entity.color } : BY_LAYER;
}

function lineTypeOf(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase();
  return upper === 'BYLAYER' ? undefined : name;
}

function textFrom(
  style: CadStyle,
  text: Partial<DwgTextBase> & { text?: string },
): CadEntity | null {
  const content = decodePercentCodes(text.text ?? '');
  if (!content.trim()) return null;
  const hAlign = text.halign ?? 0;
  const vAlign = text.valign ?? 0;
  return {
    ...style,
    type: 'text',
    position: v2(text.startPoint),
    alignPoint: hAlign !== 0 || vAlign !== 0 ? v2(text.endPoint) : undefined,
    height: text.textHeight ?? 1,
    rotation: (text.rotation ?? 0) * DEG,
    widthFactor: text.xScale || 1,
    hAlign,
    vAlign,
    text: content,
  };
}

function hatchLoops(entity: DwgHatchEntity, tolerance: number): Vec2[][] {
  const loops: Vec2[][] = [];
  for (const path of entity.boundaryPaths ?? []) {
    const points: Vec2[] = [];
    if ('vertices' in path && path.vertices) {
      const vertices = path.vertices;
      vertices.forEach((vertex, i) => {
        const p: Vec2 = [vertex.x, vertex.y];
        if (i === 0) points.push(p);
        const next = vertices[(i + 1) % vertices.length]!;
        if (i < vertices.length - 1 || path.isClosed) {
          points.push(...bulgePoints(p, [next.x, next.y], vertex.bulge ?? 0, tolerance));
        }
      });
    } else if ('edges' in path && path.edges) {
      for (const edge of path.edges as unknown as Record<string, unknown>[]) {
        const type = edge.type as number;
        if (type === 1) {
          points.push(v2(edge.start as Point), v2(edge.end as Point));
        } else if (type === 2) {
          const start = edge.startAngle as number;
          const end = edge.endAngle as number;
          const ccw = edge.isCCW !== false;
          const pts = arcPoints(
            v2(edge.center as Point),
            edge.radius as number,
            ccw ? start : -start,
            ccw ? end : -end,
            tolerance,
          );
          points.push(...(ccw ? pts : pts.reverse()));
        } else if (type === 3) {
          const major = v2(edge.end as Point);
          const ratio = (edge.lengthOfMinorAxis as number) ?? 1;
          points.push(
            ...ellipsePoints(
              v2(edge.center as Point),
              major,
              ratio,
              edge.startAngle as number,
              edge.endAngle as number,
              tolerance,
            ),
          );
        } else if (type === 4) {
          const controls = ((edge.controlPoints as Point[]) ?? []).map(v2);
          points.push(
            ...splinePoints(
              (edge.degree as number) ?? 3,
              controls,
              (edge.knots as number[]) ?? [],
              edge.weights as number[] | undefined,
              ((edge.fitDatum as Point[]) ?? []).map(v2),
            ),
          );
        }
      }
    }
    if (points.length >= 3) loops.push(points);
  }
  return loops;
}

interface ConvertContext {
  fromDwg: boolean;
  unsupported: Record<string, number>;
  tolerance: number;
}

function convertEntity(entity: DwgEntity, ctx: ConvertContext): CadEntity | null {
  if (entity.isVisible === false) return null;
  const style: CadStyle = {
    layer: entity.layer || '0',
    color: colorOf(entity),
    lineType: lineTypeOf(entity.lineType),
    lineWeight: lineWeightToMm(entity.lineweight, ctx.fromDwg),
    lineTypeScale: entity.lineTypeScale || 1,
  };
  const e = entity as unknown as Record<string, unknown> & DwgEntity;
  switch (entity.type) {
    case 'LINE':
      return {
        ...style,
        type: 'line',
        start: v2(e.startPoint as Point),
        end: v2(e.endPoint as Point),
      };
    case 'LWPOLYLINE': {
      const vertices = (e.vertices as { x: number; y: number; bulge?: number }[]) ?? [];
      return {
        ...style,
        type: 'polyline',
        closed: ((e.flag as number) & 1) === 1,
        vertices: vertices.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge ?? 0 })),
      };
    }
    case 'POLYLINE2D':
    case 'POLYLINE3D': {
      const flag = (e.flag as number) ?? 0;
      if (flag & 64 || flag & 16) {
        ctx.unsupported[`${entity.type} mesh`] = (ctx.unsupported[`${entity.type} mesh`] ?? 0) + 1;
        return null;
      }
      const vertices = (
        (e.vertices as { x: number; y: number; bulge?: number; flag?: number }[]) ?? []
      )
        // Spline frame control points are not part of the drawn curve.
        .filter((v) => ((v.flag ?? 0) & 16) === 0);
      return {
        ...style,
        type: 'polyline',
        closed: (flag & 1) === 1,
        vertices: vertices.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge ?? 0 })),
      };
    }
    case 'CIRCLE':
      return {
        ...style,
        type: 'circle',
        center: v2(e.center as Point),
        radius: e.radius as number,
      };
    case 'ARC':
      return {
        ...style,
        type: 'arc',
        center: v2(e.center as Point),
        radius: e.radius as number,
        startAngle: (e.startAngle as number) * DEG,
        endAngle: (e.endAngle as number) * DEG,
      };
    case 'ELLIPSE':
      return {
        ...style,
        type: 'ellipse',
        center: v2(e.center as Point),
        majorAxis: v2(e.majorAxisEndPoint as Point),
        ratio: (e.axisRatio as number) || 1,
        startParam: (e.startAngle as number) ?? 0,
        endParam: (e.endAngle as number) ?? Math.PI * 2,
      };
    case 'SPLINE':
      return {
        ...style,
        type: 'spline',
        degree: (e.degree as number) ?? 3,
        controlPoints: ((e.controlPoints as Point[]) ?? []).map(v2),
        knots: (e.knots as number[]) ?? [],
        weights: (e.weights as number[] | undefined)?.length ? (e.weights as number[]) : undefined,
        fitPoints: ((e.fitPoints as Point[]) ?? []).map(v2),
        closed: (((e.flag as number) ?? 0) & 1) === 1,
      };
    case 'TEXT':
      return textFrom(style, e as unknown as DwgTextBase);
    case 'MTEXT': {
      const direction = e.direction as Point | undefined;
      const rotation =
        direction && (direction.x !== 0 || direction.y !== 0)
          ? Math.atan2(direction.y, direction.x) * DEG
          : ((e.rotation as number) ?? 0) * DEG;
      return {
        ...style,
        type: 'mtext',
        position: v2(e.insertionPoint as Point),
        height: (e.textHeight as number) || 1,
        rotation,
        width: (e.rectWidth as number) ?? 0,
        attachment: (e.attachmentPoint as number) || 1,
        text: (e.text as string) ?? '',
        lineSpacing: (e.lineSpacing as number) || 1,
      };
    }
    case 'INSERT': {
      const insert = entity as unknown as DwgInsertEntity;
      const attributes: CadEntity[] = [];
      for (const attrib of insert.attribs ?? []) {
        const a = attrib as unknown as Record<string, unknown> & DwgEntity;
        if (((a.flags as number) ?? 0) & 1) continue; // invisible attribute
        const text = textFrom(
          {
            layer: a.layer || '0',
            color: colorOf(a),
            lineType: lineTypeOf(a.lineType),
            lineWeight: lineWeightToMm(a.lineweight, ctx.fromDwg),
          },
          (a.text as DwgTextBase & { text?: string }) ?? {},
        );
        if (text) attributes.push(text);
      }
      return {
        ...style,
        type: 'insert',
        block: insert.name,
        position: v2(insert.insertionPoint),
        scale: [insert.xScale || 1, insert.yScale || 1],
        rotation: (insert.rotation ?? 0) * DEG,
        columns: Math.max(1, insert.columnCount || 1),
        rows: Math.max(1, insert.rowCount || 1),
        columnSpacing: insert.columnSpacing ?? 0,
        rowSpacing: insert.rowSpacing ?? 0,
        attributes,
      };
    }
    case 'SOLID':
    case 'TRACE': {
      const c1 = v2(e.corner1 as Point);
      const c2 = v2(e.corner2 as Point);
      const c3 = v2(e.corner3 as Point);
      const c4 = e.corner4 ? v2(e.corner4 as Point) : null;
      const points: Vec2[] =
        c4 && (c4[0] !== c3[0] || c4[1] !== c3[1]) ? [c1, c2, c4, c3] : [c1, c2, c3];
      return { ...style, type: 'solid', points };
    }
    case 'HATCH': {
      const hatch = entity as unknown as DwgHatchEntity;
      return {
        ...style,
        type: 'hatch',
        loops: hatchLoops(hatch, ctx.tolerance),
        solid: hatch.solidFill === 1,
        pattern: hatch.patternName ?? '',
      };
    }
    case 'POINT':
      return { ...style, type: 'point', position: v2(e.position as Point) };
    case 'VIEWPORT': {
      const status = (e.status as number) ?? 1;
      return {
        ...style,
        type: 'viewport',
        center: v2(e.viewportCenter as Point),
        width: (e.width as number) ?? 0,
        height: (e.height as number) ?? 0,
        viewCenter: v2(e.displayCenter as Point),
        viewHeight: (e.viewHeight as number) ?? 0,
        twist: ((e.viewTwistAngle as number) ?? 0) * DEG,
        id: (e.viewportId as number) ?? 2,
        frozenLayers: (e.frozenLayerIds as string[]) ?? [],
        on: status !== 0 || ((e.viewportId as number) ?? 2) > 1,
      };
    }
    case 'DIMENSION':
      return e.name ? { ...style, type: 'dimension', block: e.name as string } : null;
    case 'LEADER':
      return {
        ...style,
        type: 'leader',
        points: ((e.vertices as Point[]) ?? []).map(v2),
        arrow: e.isArrowheadEnabled !== false,
      };
    case 'WIPEOUT': {
      const origin = v2(e.position as Point);
      const u = v2(e.uPixel as Point);
      const v = v2(e.vPixel as Point);
      const size = v2(e.imageSize as Point);
      let clip = ((e.clippingBoundaryPath as Point[]) ?? []).map(v2);
      if (clip.length === 2) {
        const [a, b] = clip as [Vec2, Vec2];
        clip = [a, [b[0], a[1]], b, [a[0], b[1]]];
      }
      // Clip vertices are in pixel space centred on the image (−0.5 … size − 0.5).
      const points = clip.map(([cx, cy]): Vec2 => {
        const px = cx + 0.5;
        const py = (size[1] || 1) - (cy + 0.5);
        return [origin[0] + px * u[0] + py * v[0], origin[1] + px * u[1] + py * v[1]];
      });
      return points.length >= 3 ? { ...style, type: 'wipeout', points } : null;
    }
    case 'ATTDEF':
      return null;
    default:
      ctx.unsupported[entity.type] = (ctx.unsupported[entity.type] ?? 0) + 1;
      return null;
  }
}

function convertAll(entities: readonly DwgEntity[], ctx: ConvertContext): CadEntity[] {
  const out: CadEntity[] = [];
  for (const entity of entities) {
    const converted = convertEntity(entity, ctx);
    if (converted) out.push(converted);
  }
  return out;
}

/**
 * The first viewport of a layout is the paper sheet itself (ID 1 in AutoCAD),
 * not a window onto model space. LibreDWG does not report that ID reliably
 * (it numbers viewports across layouts), so it is set from the entity order.
 */
export function markOverallViewport(entities: CadEntity[]): CadEntity[] {
  const index = entities.findIndex((entity) => entity.type === 'viewport');
  const first = entities[index];
  if (first?.type === 'viewport') entities[index] = { ...first, id: 1 };
  return entities;
}

/** Converts a LibreDWG database to the neutral model. */
export function convertDwgDatabase(
  db: DwgDatabase,
  options: { fromDwg: boolean; version?: string } = { fromDwg: true },
): CadDocument {
  const doc = emptyCadDocument(options.fromDwg ? 'libredwg-dwg' : 'libredwg-dxf');
  doc.version = options.version ?? '';
  doc.units = db.header.INSUNITS ?? 0;
  doc.ltScale = db.header.LTSCALE || 1;
  const ctx: ConvertContext = {
    fromDwg: options.fromDwg,
    unsupported: doc.unsupported,
    // Hatch boundary tolerance in world units; refined later by the display list.
    tolerance: 0.01,
  };

  for (const layer of db.tables.LAYER?.entries ?? []) {
    doc.layers[layer.name] = {
      name: layer.name,
      color:
        layer.colorIndex >= 1 && layer.colorIndex <= 255
          ? { kind: 'aci', index: Math.abs(layer.colorIndex) }
          : { kind: 'rgb', rgb: layer.color ?? 0 },
      lineType: layer.lineType || 'CONTINUOUS',
      lineWeight: lineWeightToMm(layer.lineweight, options.fromDwg) ?? -3,
      visible: !layer.off && !layer.frozen && layer.colorIndex >= 0,
    };
  }
  if (!doc.layers['0']) {
    doc.layers['0'] = {
      name: '0',
      color: { kind: 'aci', index: 7 },
      lineType: 'CONTINUOUS',
      lineWeight: -3,
      visible: true,
    };
  }

  for (const lt of db.tables.LTYPE?.entries ?? []) {
    const pattern = (lt.pattern ?? []).map((element) => element.elementLength);
    if (pattern.length > 1) doc.lineTypes[lt.name] = { name: lt.name, pattern };
  }

  const blockRecords = db.tables.BLOCK_RECORD?.entries ?? [];
  const byHandle = new Map(blockRecords.map((record) => [record.handle, record] as const));
  let modelRecordHandle: string | null = null;
  for (const record of blockRecords) {
    const upper = record.name.toUpperCase();
    if (upper === '*MODEL_SPACE') {
      modelRecordHandle = record.handle;
      continue;
    }
    if (upper.startsWith('*PAPER_SPACE')) continue;
    doc.blocks[record.name] = {
      name: record.name,
      base: v2(record.basePoint),
      entities: convertAll(record.entities ?? [], ctx),
    };
  }

  // Model space: entities owned by the *Model_Space block record.
  const modelEntities = db.entities.filter(
    (entity) => !modelRecordHandle || entity.ownerBlockRecordSoftId === modelRecordHandle,
  );
  doc.modelSpace = convertAll(modelEntities.length ? modelEntities : db.entities, ctx);

  // Paper-space layouts: the entities of each layout's block record.
  for (const layout of db.objects.LAYOUT ?? []) {
    if (layout.layoutName.toUpperCase() === 'MODEL') continue;
    const record = byHandle.get(layout.paperSpaceTableId);
    const entities = record?.entities?.length
      ? record.entities
      : db.entities.filter((entity) => entity.ownerBlockRecordSoftId === layout.paperSpaceTableId);
    const min = layout.minLimit;
    const max = layout.maxLimit;
    doc.layouts.push({
      name: layout.layoutName,
      tabOrder: layout.tabOrder,
      entities: markOverallViewport(convertAll(entities, ctx)),
      limits:
        min && max && max.x > min.x && max.y > min.y ? { min: v2(min), max: v2(max) } : undefined,
    });
  }
  doc.layouts.sort((a, b) => a.tabOrder - b.tabOrder);
  return doc;
}
