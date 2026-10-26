import { Dwg_Object_Supertype, Dwg_Object_Type } from '@mlightcad/libredwg-web';
import { describe, expect, it } from 'vitest';
import { findSkippedEntities, type ScanModule } from './skipped-entities';

const T = Dwg_Object_Type;

interface FakeObject {
  type: number;
  dxfname?: string;
  object?: boolean;
  subentity?: boolean;
  invisible?: boolean;
  handle?: number;
  /** Index of the owning BLOCK_HEADER object. */
  owner?: number;
  layer?: number;
}

/**
 * A stand-in for LibreDWG's WebAssembly module over a list of objects. Object
 * pointers are index + 1; entity data pointers index + 1001; object data
 * (tio) pointers index + 2001.
 */
function fakeModule(objects: FakeObject[]): ScanModule {
  const at = (ptr: number) => objects[(ptr % 1000) - 1]!;
  return {
    dwg_get_num_objects: () => objects.length,
    dwg_get_object: (_data: number, i: number) => i + 1,
    dwg_object_get_supertype: (ptr: number) =>
      at(ptr).object ? Dwg_Object_Supertype.DWG_SUPERTYPE_OBJECT : 0,
    dwg_object_get_fixedtype: (ptr: number) => at(ptr).type,
    dwg_object_get_dxfname: (ptr: number) => at(ptr).dxfname ?? '',
    dwg_obj_is_subentity: (ptr: number) => (at(ptr).subentity ? 1 : 0),
    dwg_obj_get_handle_value: (ptr: number) => BigInt(at(ptr).handle ?? 0),
    dwg_object_to_object_tio: (ptr: number) => ptr + 2000,
    dwg_object_to_entity: (ptr: number) => ptr + 1000,
    dwg_object_to_entity_tio: (ptr: number) => ptr + 1000,
    dwg_object_entity_get_invisible: (ptr: number) => (at(ptr).invisible ? 1 : 0),
    dwg_object_entity_get_layer_object_ref: (ptr: number) => ({
      handleref: { value: at(ptr).layer ?? 0x10 },
    }),
    dwg_entity_owner: (ptr: number) => {
      const owner = at(ptr).owner;
      return owner === undefined ? 0 : owner + 1 + 2000;
    },
  } as ScanModule;
}

describe('findSkippedEntities', () => {
  it('finds the visible entities LibreDWG does not convert, with their owner and layer', () => {
    const objects: FakeObject[] = [
      { type: T.DWG_TYPE_BLOCK_HEADER, object: true, handle: 0x1f },
      { type: T.DWG_TYPE_BLOCK_HEADER, object: true, handle: 0x2a },
      // Converted by LibreDWG: not reported.
      { type: T.DWG_TYPE_LINE, dxfname: 'LINE', owner: 0 },
      { type: T.DWG_TYPE_LWPOLYLINE, dxfname: 'LWPOLYLINE', owner: 0 },
      // Parts of other entities: not reported.
      { type: T.DWG_TYPE_SEQEND, dxfname: 'SEQEND', owner: 0 },
      { type: T.DWG_TYPE_ATTRIB, dxfname: 'ATTRIB', subentity: true, owner: 0 },
      { type: T.DWG_TYPE_VERTEX_2D, dxfname: 'VERTEX', subentity: true, owner: 0 },
      // Dropped by LibreDWG: reported.
      { type: T.DWG_TYPE_TRACE, dxfname: 'TRACE', owner: 0, layer: 0x11 },
      { type: T.DWG_TYPE_MINSERT, dxfname: 'INSERT', owner: 1 },
      { type: T.DWG_TYPE_POLYLINE_PFACE, dxfname: 'POLYLINE' },
      { type: T.DWG_TYPE_UNKNOWN_ENT, dxfname: 'ACPPASSET', owner: 0 },
      // Hidden: nothing is missing.
      { type: T.DWG_TYPE_TRACE, dxfname: 'TRACE', owner: 0, invisible: true },
    ];
    const layers = new Map([
      ['10', '0'],
      ['11', 'PIPE'],
    ]);
    expect(findSkippedEntities(fakeModule(objects), 1, layers)).toEqual([
      { type: 'TRACE', owner: '1F', layer: 'PIPE' },
      { type: 'MINSERT', owner: '2A', layer: '0' },
      { type: 'POLYLINE (mesh)', owner: '', layer: '0' },
      { type: 'ACPPASSET', owner: '1F', layer: '0' },
    ]);
  });

  it('finds nothing in a file whose entities are all converted', () => {
    const objects: FakeObject[] = [
      { type: T.DWG_TYPE_BLOCK_HEADER, object: true, handle: 0x1f },
      { type: T.DWG_TYPE_INSERT, dxfname: 'INSERT', owner: 0 },
      { type: T.DWG_TYPE_HATCH, dxfname: 'HATCH', owner: 0 },
      { type: T.DWG_TYPE_BLOCK, dxfname: 'BLOCK' },
      { type: T.DWG_TYPE_ENDBLK, dxfname: 'ENDBLK' },
    ];
    expect(findSkippedEntities(fakeModule(objects), 1, new Map())).toEqual([]);
  });
});
