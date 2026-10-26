/**
 * Finds the entities that LibreDWG's converter leaves out of its database. It
 * converts the entity types in CONVERTED below and silently drops every other
 * one: TRACE, MINSERT, REGION, PDF/DWF/DGN underlays, objects of add-on
 * applications (AutoCAD P&ID, Plant 3D, Civil 3D…) and entities it cannot
 * decode. Scanning the file's objects for them lets the app tell the user what
 * a sheet is missing, instead of leaving it out unnoticed (DRW-02).
 *
 * Runs only inside the DWG reader worker, the licence boundary around the
 * GPL-licensed LibreDWG (see dwg.worker.ts).
 */
import { Dwg_Object_Supertype, Dwg_Object_Type, type createModule } from '@mlightcad/libredwg-web';
import type { SkippedEntity } from './convert-libredwg';

type Module = Awaited<ReturnType<typeof createModule>>;

/** The calls of the LibreDWG WebAssembly module the scan uses. */
export type ScanModule = Pick<
  Module,
  | 'dwg_get_num_objects'
  | 'dwg_get_object'
  | 'dwg_object_get_supertype'
  | 'dwg_object_get_fixedtype'
  | 'dwg_object_get_dxfname'
  | 'dwg_obj_is_subentity'
  | 'dwg_obj_get_handle_value'
  | 'dwg_object_to_object_tio'
  | 'dwg_object_to_entity'
  | 'dwg_object_to_entity_tio'
  | 'dwg_object_entity_get_invisible'
  | 'dwg_object_entity_get_layer_object_ref'
  | 'dwg_entity_owner'
>;

const T = Dwg_Object_Type;

/** Entity types LibreDWG's converter turns into data (LibreEntityConverter.convert). */
const CONVERTED = new Set<number>([
  T.DWG_TYPE_3DFACE,
  T.DWG_TYPE_3DSOLID,
  T.DWG_TYPE_ARC,
  T.DWG_TYPE_ARCALIGNEDTEXT,
  T.DWG_TYPE_ATTDEF,
  T.DWG_TYPE_CIRCLE,
  T.DWG_TYPE_DIMENSION_ALIGNED,
  T.DWG_TYPE_DIMENSION_LINEAR,
  T.DWG_TYPE_DIMENSION_ANG3PT,
  T.DWG_TYPE_DIMENSION_ANG2LN,
  T.DWG_TYPE_DIMENSION_DIAMETER,
  T.DWG_TYPE_DIMENSION_ORDINATE,
  T.DWG_TYPE_DIMENSION_RADIUS,
  T.DWG_TYPE_ELLIPSE,
  T.DWG_TYPE_HATCH,
  T.DWG_TYPE_IMAGE,
  T.DWG_TYPE_INSERT,
  T.DWG_TYPE_LEADER,
  T.DWG_TYPE_LINE,
  T.DWG_TYPE_LWPOLYLINE,
  T.DWG_TYPE_MLINE,
  T.DWG_TYPE_MULTILEADER,
  T.DWG_TYPE_MTEXT,
  T.DWG_TYPE_OLE2FRAME,
  T.DWG_TYPE_OLEFRAME,
  T.DWG_TYPE_POINT,
  T.DWG_TYPE_POLYLINE_2D,
  T.DWG_TYPE_POLYLINE_3D,
  T.DWG_TYPE_PROXY_ENTITY,
  T.DWG_TYPE_RAY,
  T.DWG_TYPE_SECTIONOBJECT,
  T.DWG_TYPE_SHAPE,
  T.DWG_TYPE_SOLID,
  T.DWG_TYPE_SPLINE,
  T.DWG_TYPE_TABLE,
  T.DWG_TYPE_TEXT,
  T.DWG_TYPE_TOLERANCE,
  T.DWG_TYPE_VIEWPORT,
  T.DWG_TYPE_WIPEOUT,
  T.DWG_TYPE_XLINE,
]);

/** Parts of other entities or of block definitions, read with them, never drawn on their own. */
const PARTS = new Set<number>([
  T.DWG_TYPE_BLOCK,
  T.DWG_TYPE_ENDBLK,
  T.DWG_TYPE_SEQEND,
  T.DWG_TYPE_ATTRIB,
  T.DWG_TYPE_VERTEX_2D,
  T.DWG_TYPE_VERTEX_3D,
  T.DWG_TYPE_VERTEX_MESH,
  T.DWG_TYPE_VERTEX_PFACE,
  T.DWG_TYPE_VERTEX_PFACE_FACE,
]);

/** Names for types whose DXF name is shared with a type that is drawn. */
const NAMES: Partial<Record<number, string>> = {
  [T.DWG_TYPE_MINSERT]: 'MINSERT',
  [T.DWG_TYPE_POLYLINE_PFACE]: 'POLYLINE (mesh)',
  [T.DWG_TYPE_POLYLINE_MESH]: 'POLYLINE (mesh)',
};

/** Handles as LibreDWG's converter writes them: upper-case hexadecimal. */
const handleString = (value: bigint | number | null | undefined): string =>
  value === null || value === undefined ? '' : value.toString(16).toUpperCase();

/**
 * The visible entities in `data` that LibreDWG's converter drops, each with
 * the block record that owns it and its layer. `layerNames` maps layer
 * handles to names.
 */
export function findSkippedEntities(
  wasm: ScanModule,
  data: number,
  layerNames: ReadonlyMap<string, string>,
): SkippedEntity[] {
  const count = wasm.dwg_get_num_objects(data);
  // dwg_entity_owner returns the owner's object data (tio); map it to its handle.
  const recordHandles = new Map<number, string>();
  const candidates: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const obj = wasm.dwg_get_object(data, i);
    if (!obj) continue;
    const type = wasm.dwg_object_get_fixedtype(obj);
    if (wasm.dwg_object_get_supertype(obj) === Dwg_Object_Supertype.DWG_SUPERTYPE_ENTITY) {
      if (!CONVERTED.has(type) && !PARTS.has(type) && !wasm.dwg_obj_is_subentity(obj)) {
        candidates.push(obj);
      }
    } else if (type === T.DWG_TYPE_BLOCK_HEADER) {
      const tio = wasm.dwg_object_to_object_tio(obj);
      if (tio) recordHandles.set(tio, handleString(wasm.dwg_obj_get_handle_value(obj)));
    }
  }

  const skipped: SkippedEntity[] = [];
  for (const obj of candidates) {
    const entity = wasm.dwg_object_to_entity(obj);
    if (!entity || wasm.dwg_object_entity_get_invisible(entity)) continue;
    const tio = wasm.dwg_object_to_entity_tio(obj);
    // Resolves the owner handle, or model/paper space from the entity mode.
    const ownerTio = tio ? wasm.dwg_entity_owner(tio) : 0;
    const layerRef = wasm.dwg_object_entity_get_layer_object_ref(entity) as
      { handleref?: { value?: bigint | number } } | undefined;
    const type = wasm.dwg_object_get_fixedtype(obj);
    skipped.push({
      type: NAMES[type] ?? (wasm.dwg_object_get_dxfname(obj) || `type ${type}`),
      owner: (ownerTio && recordHandles.get(ownerTio)) || '',
      layer: layerNames.get(handleString(layerRef?.handleref?.value)) ?? '0',
    });
  }
  return skipped;
}
