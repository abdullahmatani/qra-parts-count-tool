/**
 * Builds a display list from a CAD document for one space (model space or a
 * paper-space layout): every entity, block reference and viewport is flattened
 * into styled polylines, filled polygons and text runs in drawing coordinates
 * (points, y down). The display list is what the canvas renderer draws and what
 * is cached in the working directory's `cache/` folder (DRW-02).
 */
import { colorToRgb } from './aci';
import { arcPoints, circlePoints, ellipsePoints, polylinePoints, splinePoints } from './geometry';
import {
  INSUNITS,
  MODEL_SPACE,
  type CadColor,
  type CadDocument,
  type CadEntity,
  type CadLayer,
  type Vec2,
} from './model';
import { decodePercentCodes, mtextToLines } from './text-codes';

export const DISPLAY_LIST_VERSION = 1;

/** Default line weight (0.25 mm) in points. */
const DEFAULT_WEIGHT_PT = (0.25 * 72) / 25.4;
const MM_TO_PT = 72 / 25.4;
/** Cap height to font size ratio for the sans-serif stand-in for CAD fonts. */
export const CAP_HEIGHT_RATIO = 0.72;
/** Chord tolerance for curves, in points on the drawing. */
const TOLERANCE_PT = 0.15;
const MAX_BLOCK_DEPTH = 16;

export interface StrokeBatch {
  color: number;
  /** Line width in drawing units (points). */
  width: number;
  /** Dash pattern in drawing units, or null for continuous. */
  dash: number[] | null;
  /** Flat coordinate arrays [x0, y0, x1, y1, …], one per polyline. */
  paths: number[][];
}

export interface FillBatch {
  color: number;
  alpha: number;
  /** Polygons (flat coordinates); loops of one hatch are grouped for even-odd filling. */
  shapes: number[][][];
}

export interface TextRun {
  text: string;
  /** Anchor in drawing coordinates. */
  x: number;
  y: number;
  /** Canvas transform of the text's local frame (1 unit = 1 text-height-scaled unit). */
  a: number;
  b: number;
  c: number;
  d: number;
  /** Font size in the local frame (cap height / CAP_HEIGHT_RATIO). */
  size: number;
  align: 'left' | 'center' | 'right';
  baseline: 'alphabetic' | 'bottom' | 'middle' | 'top';
  color: number;
}

export interface DisplayGroup {
  /** Clip polygon in drawing coordinates (paper-space viewport), or null. */
  clip: number[] | null;
  fills: FillBatch[];
  strokes: StrokeBatch[];
  texts: TextRun[];
}

export interface DisplayList {
  version: number;
  space: string;
  width: number;
  height: number;
  groups: DisplayGroup[];
  stats: { paths: number; segments: number; fills: number; texts: number; blocks: number };
}

export interface SpaceInfo {
  name: string;
  entities: number;
  viewports: number;
}

/** Model space plus every paper-space layout, with entity counts (for the layout picker). */
export function listSpaces(doc: CadDocument): SpaceInfo[] {
  const spaces: SpaceInfo[] = [
    { name: MODEL_SPACE, entities: doc.modelSpace.length, viewports: 0 },
  ];
  for (const layout of doc.layouts) {
    spaces.push({
      name: layout.name,
      entities: layout.entities.length,
      viewports: layout.entities.filter((e) => e.type === 'viewport' && e.id !== 1).length,
    });
  }
  return spaces;
}

// ---------------------------------------------------------------------------
// Affine transforms (world → target), [a, b, c, d, e, f] as in canvas.
// ---------------------------------------------------------------------------

type Affine = [number, number, number, number, number, number];
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
const scale = (sx: number, sy: number): Affine => [sx, 0, 0, sy, 0, 0];
function rotate(degrees: number): Affine {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}
function apply(m: Affine, x: number, y: number): Vec2 {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function linearScale(m: Affine): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

interface Style {
  color: number;
  width: number;
  dash: number[] | null;
}

interface Context {
  m: Affine;
  /** Layer of the enclosing block reference (entities on layer "0" take it). */
  blockLayer: string | null;
  blockColor: CadColor;
  blockLineType: string | null;
  blockLineWeight: number | undefined;
  depth: number;
  frozen: Set<string> | null;
}

/** Collects primitives in a working coordinate space; mapped to drawing units at the end. */
class Collector {
  groups: DisplayGroup[] = [];
  current!: DisplayGroup;
  private strokeIndex = new Map<string, StrokeBatch>();
  private fillIndex = new Map<string, FillBatch>();
  stats = { paths: 0, segments: 0, fills: 0, texts: 0, blocks: 0 };
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  constructor() {
    this.newGroup(null);
  }

  newGroup(clip: number[] | null): void {
    this.current = { clip, fills: [], strokes: [], texts: [] };
    this.groups.push(this.current);
    this.strokeIndex = new Map();
    this.fillIndex = new Map();
  }

  private extend(x: number, y: number): void {
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  stroke(style: Style, points: Vec2[]): void {
    if (points.length < 2) return;
    const key = `${style.color}|${style.width.toFixed(3)}|${style.dash?.join(',') ?? ''}`;
    let batch = this.strokeIndex.get(key);
    if (!batch) {
      batch = { color: style.color, width: style.width, dash: style.dash, paths: [] };
      this.strokeIndex.set(key, batch);
      this.current.strokes.push(batch);
    }
    const flat: number[] = new Array(points.length * 2);
    points.forEach(([x, y], i) => {
      flat[i * 2] = x;
      flat[i * 2 + 1] = y;
      this.extend(x, y);
    });
    batch.paths.push(flat);
    this.stats.paths += 1;
    this.stats.segments += points.length - 1;
  }

  fill(color: number, alpha: number, loops: Vec2[][]): void {
    const shapes = loops.filter((loop) => loop.length >= 3);
    if (shapes.length === 0) return;
    const key = `${color}|${alpha}`;
    let batch = this.fillIndex.get(key);
    if (!batch) {
      batch = { color, alpha, shapes: [] };
      this.fillIndex.set(key, batch);
      this.current.fills.push(batch);
    }
    batch.shapes.push(
      shapes.map((loop) =>
        loop.flatMap(([x, y]) => {
          this.extend(x, y);
          return [x, y];
        }),
      ),
    );
    this.stats.fills += 1;
  }

  text(run: TextRun): void {
    this.current.texts.push(run);
    this.extend(run.x, run.y);
    this.stats.texts += 1;
  }

  get empty(): boolean {
    return !(this.maxX >= this.minX);
  }
}

function unitToPoints(units: number): number {
  switch (units) {
    case INSUNITS.inches:
      return 72;
    case INSUNITS.feet:
      return 864;
    case INSUNITS.centimetres:
      return 10 * MM_TO_PT;
    case INSUNITS.metres:
      return 1000 * MM_TO_PT;
    case INSUNITS.millimetres:
    default:
      // Unitless drawings are usually millimetres on a plotted sheet.
      return MM_TO_PT;
  }
}

export interface BuildOptions {
  /** Chord tolerance in points (default 0.15). */
  tolerancePt?: number;
}

/**
 * Builds the display list for `space` ("Model" or a layout name). Throws if the
 * space does not exist.
 */
export function buildDisplayList(
  doc: CadDocument,
  space: string,
  options: BuildOptions = {},
): DisplayList {
  const isModel = space === MODEL_SPACE;
  const layout = isModel ? null : doc.layouts.find((l) => l.name === space);
  if (!isModel && !layout) throw new Error(`Layout "${space}" not found`);

  const layers = new Map<string, CadLayer>();
  for (const layer of Object.values(doc.layers)) layers.set(layer.name.toUpperCase(), layer);
  const lineTypes = new Map(
    Object.values(doc.lineTypes).map((lt) => [lt.name.toUpperCase(), lt] as const),
  );
  const blocks = new Map(Object.values(doc.blocks).map((b) => [b.name.toUpperCase(), b] as const));

  // World units → points, so curve tolerances can be expressed on the drawing.
  const unitPt = unitToPoints(doc.units);
  const tolerancePt = options.tolerancePt ?? TOLERANCE_PT;
  const out = new Collector();

  const layerOf = (name: string): CadLayer | undefined => layers.get(name.toUpperCase());

  function resolveStyle(entity: CadEntity, ctx: Context): { style: Style; layer: string } | null {
    const layerName = entity.layer === '0' && ctx.blockLayer ? ctx.blockLayer : entity.layer;
    const layer = layerOf(layerName);
    if (layer && !layer.visible) return null;
    if (ctx.frozen?.has(layerName.toUpperCase())) return null;
    let color: CadColor = entity.color;
    if (color.kind === 'byLayer') color = layer?.color ?? { kind: 'aci', index: 7 };
    if (color.kind === 'byBlock') color = ctx.blockColor;
    if (color.kind === 'byLayer' || color.kind === 'byBlock') color = { kind: 'aci', index: 7 };

    let weight = entity.lineWeight;
    if (weight === undefined || weight === -1) weight = layer?.lineWeight;
    if (weight === -2) weight = ctx.blockLineWeight;
    const width =
      weight !== undefined && weight >= 0 ? Math.max(weight, 0.05) * MM_TO_PT : DEFAULT_WEIGHT_PT;

    let lineType = entity.lineType?.toUpperCase();
    if (!lineType || lineType === 'BYLAYER') lineType = layer?.lineType?.toUpperCase();
    if (lineType === 'BYBLOCK') lineType = ctx.blockLineType ?? undefined;
    let dash: number[] | null = null;
    const pattern = lineType ? lineTypes.get(lineType)?.pattern : undefined;
    if (pattern && pattern.length > 1) {
      const factor = (doc.ltScale || 1) * (entity.lineTypeScale || 1) * linearScale(ctx.m);
      dash = pattern.map((v) => Math.max(Math.abs(v) * factor, 1e-6));
    }
    return { style: { color: colorToRgb(color), width, dash }, layer: layerName };
  }

  /** World tolerance for curves at the current transform. */
  const tolerance = (ctx: Context) => tolerancePt / (unitPt * linearScale(ctx.m));
  const map = (ctx: Context, points: Vec2[]): Vec2[] => points.map(([x, y]) => apply(ctx.m, x, y));

  function emitText(
    ctx: Context,
    color: number,
    text: string,
    origin: Vec2,
    height: number,
    rotationDeg: number,
    widthFactor: number,
    align: TextRun['align'],
    baseline: TextRun['baseline'],
  ): void {
    if (!text.trim() || !(height > 0)) return;
    const r = (rotationDeg * Math.PI) / 180;
    const ux: Vec2 = [Math.cos(r) * (widthFactor || 1), Math.sin(r) * (widthFactor || 1)];
    const uy: Vec2 = [-Math.sin(r), Math.cos(r)];
    const [x, y] = apply(ctx.m, origin[0], origin[1]);
    const m = ctx.m;
    out.text({
      text,
      x,
      y,
      a: m[0] * ux[0] + m[2] * ux[1],
      b: m[1] * ux[0] + m[3] * ux[1],
      c: m[0] * uy[0] + m[2] * uy[1],
      d: m[1] * uy[0] + m[3] * uy[1],
      size: height / CAP_HEIGHT_RATIO,
      align,
      baseline,
      color,
    });
  }

  function emit(entity: CadEntity, ctx: Context): void {
    const resolved = resolveStyle(entity, ctx);
    if (!resolved) return;
    const { style } = resolved;
    const tol = tolerance(ctx);

    switch (entity.type) {
      case 'line':
        out.stroke(style, map(ctx, [entity.start, entity.end]));
        return;
      case 'polyline':
        out.stroke(style, map(ctx, polylinePoints(entity.vertices, entity.closed, tol)));
        return;
      case 'circle':
        out.stroke(style, map(ctx, circlePoints(entity.center, entity.radius, tol)));
        return;
      case 'arc':
        out.stroke(
          style,
          map(
            ctx,
            arcPoints(
              entity.center,
              entity.radius,
              (entity.startAngle * Math.PI) / 180,
              (entity.endAngle * Math.PI) / 180,
              tol,
            ),
          ),
        );
        return;
      case 'ellipse':
        out.stroke(
          style,
          map(
            ctx,
            ellipsePoints(
              entity.center,
              entity.majorAxis,
              entity.ratio,
              entity.startParam,
              entity.endParam,
              tol,
            ),
          ),
        );
        return;
      case 'spline': {
        const pts = splinePoints(
          entity.degree,
          entity.controlPoints,
          entity.knots,
          entity.weights,
          entity.fitPoints,
        );
        if (entity.closed && pts.length > 2) pts.push(pts[0]!);
        out.stroke(style, map(ctx, pts));
        return;
      }
      case 'leader': {
        out.stroke(style, map(ctx, entity.points));
        if (entity.arrow && entity.points.length >= 2) {
          const [p0, p1] = [entity.points[0]!, entity.points[1]!];
          const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          if (len > 0) {
            // Arrowhead of 2.5 mm on the sheet (AutoCAD's default DIMASZ), at most a third of the leg.
            const size = Math.min(len / 3, (2.5 * MM_TO_PT) / (unitPt * linearScale(ctx.m)));
            const ux = (p1[0] - p0[0]) / len;
            const uy = (p1[1] - p0[1]) / len;
            const tip: Vec2 = p0;
            const base: Vec2 = [p0[0] + ux * size, p0[1] + uy * size];
            const half = size / 6;
            out.fill(style.color, 1, [
              map(ctx, [
                tip,
                [base[0] - uy * half, base[1] + ux * half],
                [base[0] + uy * half, base[1] - ux * half],
              ]),
            ]);
          }
        }
        return;
      }
      case 'solid':
        out.fill(style.color, 1, [map(ctx, entity.points)]);
        return;
      case 'wipeout':
        out.fill(0xffffff, 1, [map(ctx, entity.points)]);
        return;
      case 'hatch':
        // Solid fills are drawn solid; pattern hatches as a light tint of their colour.
        out.fill(
          style.color,
          entity.solid ? 1 : 0.18,
          entity.loops.map((loop) => map(ctx, loop)),
        );
        return;
      case 'point':
        return;
      case 'text': {
        const hAlign = entity.hAlign;
        const useAlignPoint =
          entity.alignPoint &&
          (hAlign !== 0 || entity.vAlign !== 0) &&
          hAlign !== 3 &&
          hAlign !== 5;
        const origin = useAlignPoint ? entity.alignPoint! : entity.position;
        const align = hAlign === 1 || hAlign === 4 ? 'center' : hAlign === 2 ? 'right' : 'left';
        const baseline =
          hAlign === 4 || entity.vAlign === 2
            ? 'middle'
            : entity.vAlign === 1
              ? 'bottom'
              : entity.vAlign === 3
                ? 'top'
                : 'alphabetic';
        emitText(
          ctx,
          style.color,
          decodePercentCodes(entity.text),
          origin,
          entity.height,
          entity.rotation,
          entity.widthFactor,
          align,
          baseline,
        );
        return;
      }
      case 'mtext': {
        const lines = mtextToLines(entity.text);
        const column = (entity.attachment - 1) % 3;
        const row = Math.floor((entity.attachment - 1) / 3);
        const align = column === 1 ? 'center' : column === 2 ? 'right' : 'left';
        const lineHeight = entity.height * 1.667 * (entity.lineSpacing || 1);
        const blockHeight = (lines.length - 1) * lineHeight + entity.height;
        // Offset (in text-local "up" units) of the first baseline from the anchor.
        const firstBaseline =
          row === 0
            ? -entity.height
            : row === 1
              ? blockHeight / 2 - entity.height
              : blockHeight - entity.height;
        const r = (entity.rotation * Math.PI) / 180;
        lines.forEach((line, i) => {
          const up = firstBaseline - i * lineHeight;
          const origin: Vec2 = [
            entity.position[0] - Math.sin(r) * up,
            entity.position[1] + Math.cos(r) * up,
          ];
          emitText(
            ctx,
            style.color,
            line,
            origin,
            entity.height,
            entity.rotation,
            1,
            align,
            'alphabetic',
          );
        });
        return;
      }
      case 'dimension':
      case 'insert': {
        const block = blocks.get(entity.block.toUpperCase());
        if (block && ctx.depth < MAX_BLOCK_DEPTH) {
          const child = (m: Affine): Context => ({
            m,
            blockLayer: resolved.layer,
            blockColor:
              entity.color.kind === 'byLayer'
                ? (layerOf(resolved.layer)?.color ?? entity.color)
                : entity.color.kind === 'byBlock'
                  ? ctx.blockColor
                  : entity.color,
            blockLineType:
              !entity.lineType || entity.lineType.toUpperCase() === 'BYLAYER'
                ? (layerOf(resolved.layer)?.lineType ?? null)
                : entity.lineType,
            blockLineWeight: entity.lineWeight,
            depth: ctx.depth + 1,
            frozen: ctx.frozen,
          });
          if (entity.type === 'dimension') {
            // Dimension blocks are defined in world coordinates.
            out.stats.blocks += 1;
            for (const e of block.entities) emit(e, child(ctx.m));
          } else {
            const columns = Math.max(1, entity.columns || 1);
            const rows = Math.max(1, entity.rows || 1);
            for (let c = 0; c < columns; c += 1) {
              for (let r = 0; r < rows; r += 1) {
                const m = multiply(
                  ctx.m,
                  multiply(
                    translate(entity.position[0], entity.position[1]),
                    multiply(
                      rotate(entity.rotation),
                      multiply(
                        translate(c * entity.columnSpacing, r * entity.rowSpacing),
                        multiply(
                          scale(entity.scale[0] || 1, entity.scale[1] || 1),
                          translate(-block.base[0], -block.base[1]),
                        ),
                      ),
                    ),
                  ),
                );
                out.stats.blocks += 1;
                for (const e of block.entities) emit(e, child(m));
              }
            }
          }
        }
        if (entity.type === 'insert') {
          // Attributes are stored in the insert's own coordinate space.
          for (const attribute of entity.attributes)
            emit(attribute, { ...ctx, blockLayer: resolved.layer });
        }
        return;
      }
      case 'viewport':
        // Handled by the layout pass.
        return;
      default:
        return;
    }
  }

  const rootContext = (m: Affine, frozen: Set<string> | null = null): Context => ({
    m,
    blockLayer: null,
    blockColor: { kind: 'aci', index: 7 },
    blockLineType: null,
    blockLineWeight: undefined,
    depth: 0,
    frozen,
  });

  let limits: { min: Vec2; max: Vec2 } | null = null;
  if (isModel) {
    for (const entity of doc.modelSpace) emit(entity, rootContext(IDENTITY));
  } else {
    const entities = layout!.entities;
    for (const entity of entities)
      if (entity.type !== 'viewport') emit(entity, rootContext(IDENTITY));
    for (const vp of entities) {
      if (vp.type !== 'viewport' || vp.id === 1 || !vp.on || !(vp.viewHeight > 0)) continue;
      // Model point → paper: centre + k · R(twist) · (p − viewCentre).
      const k = vp.height / vp.viewHeight;
      const m = multiply(
        translate(vp.center[0], vp.center[1]),
        multiply(
          rotate(vp.twist),
          multiply(scale(k, k), translate(-vp.viewCenter[0], -vp.viewCenter[1])),
        ),
      );
      const hw = vp.width / 2;
      const hh = vp.height / 2;
      out.newGroup([
        vp.center[0] - hw,
        vp.center[1] - hh,
        vp.center[0] + hw,
        vp.center[1] - hh,
        vp.center[0] + hw,
        vp.center[1] + hh,
        vp.center[0] - hw,
        vp.center[1] + hh,
      ]);
      const frozen = new Set(vp.frozenLayers.map((name) => name.toUpperCase()));
      for (const entity of doc.modelSpace) emit(entity, rootContext(m, frozen));
      out.newGroup(null);
    }
    const lim = layout!.limits;
    if (lim && lim.max[0] > lim.min[0] && lim.max[1] > lim.min[1]) limits = lim;
  }

  // ---- map working coordinates to drawing units (points, y down) ----------
  let minX: number;
  let minY: number;
  let maxX: number;
  let maxY: number;
  if (limits) {
    [minX, minY] = limits.min;
    [maxX, maxY] = limits.max;
    // Include anything drawn outside the limits.
    if (!out.empty) {
      minX = Math.min(minX, out.minX);
      minY = Math.min(minY, out.minY);
      maxX = Math.max(maxX, out.maxX);
      maxY = Math.max(maxY, out.maxY);
    }
  } else if (out.empty) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  } else {
    ({ minX, minY, maxX, maxY } = out);
  }
  const worldW = Math.max(maxX - minX, 1e-6);
  const worldH = Math.max(maxY - minY, 1e-6);
  let s = unitPt;
  const long = Math.max(worldW, worldH) * s;
  // Keep model-space drawings at a workable sheet size (e.g. plant-scale models in mm).
  if (isModel && (long > 20_000 || long < 200)) s = 3370 / Math.max(worldW, worldH);
  const margin = limits ? 0 : Math.max(worldW, worldH) * s * 0.02;
  const mapX = (x: number) => (x - minX) * s + margin;
  const mapY = (y: number) => (maxY - y) * s + margin;
  const round = (v: number) => Math.round(v * 100) / 100;

  const groups = out.groups
    .filter((g) => g.fills.length + g.strokes.length + g.texts.length > 0)
    .map((group) => ({
      clip: group.clip ? group.clip.map((v, i) => round(i % 2 === 0 ? mapX(v) : mapY(v))) : null,
      fills: group.fills.map((fill) => ({
        ...fill,
        shapes: fill.shapes.map((shape) =>
          shape.map((loop) => loop.map((v, i) => round(i % 2 === 0 ? mapX(v) : mapY(v)))),
        ),
      })),
      strokes: group.strokes.map((batch) => ({
        ...batch,
        width: round(batch.width),
        dash: batch.dash ? batch.dash.map((v) => round(Math.max(v * s, 0.1))) : null,
        paths: batch.paths.map((path) =>
          path.map((v, i) => round(i % 2 === 0 ? mapX(v) : mapY(v))),
        ),
      })),
      texts: group.texts.map((run) => ({
        ...run,
        x: round(mapX(run.x)),
        y: round(mapY(run.y)),
        // The y flip turns "up" into negative y on the drawing.
        a: run.a * s,
        b: -run.b * s,
        c: run.c * s,
        d: -run.d * s,
      })),
    }));

  return {
    version: DISPLAY_LIST_VERSION,
    space,
    width: round(worldW * s + 2 * margin),
    height: round(worldH * s + 2 * margin),
    groups,
    stats: out.stats,
  };
}

/** All text in a display list, as positioned items for title-block reading (DRW-04). */
export function displayListText(
  list: DisplayList,
): { text: string; x: number; y: number; size: number; width: number; angle: number }[] {
  return list.groups.flatMap((group) =>
    group.texts.map((run) => {
      const unit = Math.hypot(run.c, run.d);
      return {
        text: run.text,
        x: run.x,
        y: run.y,
        size: run.size * unit * CAP_HEIGHT_RATIO,
        width: run.text.length * run.size * unit * 0.5,
        angle: (Math.atan2(-run.b, run.a) * 180) / Math.PI,
      };
    }),
  );
}
