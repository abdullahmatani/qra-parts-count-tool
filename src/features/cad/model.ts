/**
 * Neutral CAD document model (DRW-02, DRW-10).
 *
 * Every CAD reader (the DXF parser in this app, the LibreDWG-based DWG reader,
 * or a future ODA-based reader) converts its input into this model, and a
 * single display-list builder and renderer work from it. The model is plain,
 * structured-cloneable data, so it can cross worker boundaries.
 *
 * Coordinates are CAD world coordinates (y up). Angles are in degrees,
 * counter-clockwise, except ellipse parameters, which are in radians.
 */

export type Vec2 = [number, number];

export type CadColor =
  | { kind: 'byLayer' }
  | { kind: 'byBlock' }
  /** AutoCAD Color Index 1–255 (7 is black on white paper). */
  | { kind: 'aci'; index: number }
  /** True colour 0xRRGGBB. */
  | { kind: 'rgb'; rgb: number };

export const BY_LAYER: CadColor = { kind: 'byLayer' };
export const BY_BLOCK: CadColor = { kind: 'byBlock' };

export interface CadStyle {
  layer: string;
  color: CadColor;
  /** Linetype name; undefined means ByLayer. "ByBlock" is passed through. */
  lineType?: string;
  /** Line weight in millimetres; undefined means ByLayer, -2 ByBlock, -3 default. */
  lineWeight?: number;
  lineTypeScale?: number;
}

export interface CadVertex {
  x: number;
  y: number;
  /** Arc bulge to the next vertex (tan of a quarter of the included angle). */
  bulge: number;
}

export type CadEntity = CadStyle &
  (
    | { type: 'line'; start: Vec2; end: Vec2 }
    | { type: 'polyline'; vertices: CadVertex[]; closed: boolean }
    | { type: 'circle'; center: Vec2; radius: number }
    | { type: 'arc'; center: Vec2; radius: number; startAngle: number; endAngle: number }
    | {
        type: 'ellipse';
        center: Vec2;
        /** Major axis end point, relative to the centre. */
        majorAxis: Vec2;
        ratio: number;
        startParam: number;
        endParam: number;
      }
    | {
        type: 'spline';
        degree: number;
        controlPoints: Vec2[];
        knots: number[];
        weights?: number[];
        fitPoints: Vec2[];
        closed: boolean;
      }
    | {
        type: 'text';
        position: Vec2;
        /** Second alignment point, used for non-left alignments. */
        alignPoint?: Vec2;
        height: number;
        rotation: number;
        widthFactor: number;
        /** 0 left, 1 center, 2 right, 3 aligned, 4 middle, 5 fit. */
        hAlign: number;
        /** 0 baseline, 1 bottom, 2 middle, 3 top. */
        vAlign: number;
        text: string;
      }
    | {
        type: 'mtext';
        position: Vec2;
        height: number;
        rotation: number;
        width: number;
        /** 1–9: top-left … bottom-right. */
        attachment: number;
        /** Raw MTEXT content, including formatting codes. */
        text: string;
        lineSpacing: number;
      }
    | {
        type: 'insert';
        block: string;
        position: Vec2;
        scale: Vec2;
        rotation: number;
        columns: number;
        rows: number;
        columnSpacing: number;
        rowSpacing: number;
        /** Attribute texts, already in world coordinates. */
        attributes: CadEntity[];
      }
    /** SOLID/TRACE corners in drawing order (already reordered from DXF 1-2-4-3). */
    | { type: 'solid'; points: Vec2[] }
    | { type: 'hatch'; loops: Vec2[][]; solid: boolean; pattern: string }
    | { type: 'point'; position: Vec2 }
    | {
        type: 'viewport';
        center: Vec2;
        width: number;
        height: number;
        viewCenter: Vec2;
        viewHeight: number;
        twist: number;
        /** 1 is the paper-space viewport itself, which is not drawn. */
        id: number;
        frozenLayers: string[];
        on: boolean;
      }
    /** Dimensions are drawn from their generated anonymous block (in world coordinates). */
    | { type: 'dimension'; block: string }
    | { type: 'leader'; points: Vec2[]; arrow: boolean }
    | { type: 'wipeout'; points: Vec2[] }
  );

export type CadEntityType = CadEntity['type'];

export interface CadLayer {
  name: string;
  color: CadColor;
  lineType: string;
  /** Millimetres; negative for default. */
  lineWeight: number;
  visible: boolean;
}

export interface CadLineType {
  name: string;
  /** Dash pattern in drawing units: positive dash, negative gap, 0 dot. */
  pattern: number[];
}

export interface CadBlock {
  name: string;
  base: Vec2;
  entities: CadEntity[];
}

export interface CadLayout {
  name: string;
  tabOrder: number;
  entities: CadEntity[];
  /** Paper limits in paper units, when known. */
  limits?: { min: Vec2; max: Vec2 };
}

/** $INSUNITS codes that matter for scaling (others are treated as unitless). */
export const INSUNITS = {
  unitless: 0,
  inches: 1,
  feet: 2,
  millimetres: 4,
  centimetres: 5,
  metres: 6,
} as const;

export interface CadDocument {
  /** Reader that produced the document, e.g. "dxf" or "libredwg". */
  source: string;
  /** File format version, e.g. "AC1032". */
  version: string;
  /** $INSUNITS drawing units code. */
  units: number;
  /** Global linetype scale ($LTSCALE). */
  ltScale: number;
  layers: Record<string, CadLayer>;
  lineTypes: Record<string, CadLineType>;
  blocks: Record<string, CadBlock>;
  modelSpace: CadEntity[];
  /** Paper-space layouts (not including "Model"). */
  layouts: CadLayout[];
  /** Entity types the reader met but could not represent, with counts. */
  unsupported: Record<string, number>;
}

/** Name used for model space in layout lists and on drawings. */
export const MODEL_SPACE = 'Model';

export function emptyCadDocument(source: string): CadDocument {
  return {
    source,
    version: '',
    units: INSUNITS.unitless,
    ltScale: 1,
    layers: {},
    lineTypes: {},
    blocks: {},
    modelSpace: [],
    layouts: [],
    unsupported: {},
  };
}
