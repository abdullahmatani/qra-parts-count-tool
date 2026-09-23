import type { DisplayList, SpaceInfo } from '../display-list';

export type CadFileType = 'dwg' | 'dxf';

/** Messages to a CAD reader worker. */
export type CadRequest =
  | { id: number; op: 'open'; bytes: ArrayBuffer; fileType: CadFileType }
  | { id: number; op: 'build'; docId: number; space: string }
  | { id: number; op: 'close'; docId: number };

export interface OpenResult {
  docId: number;
  spaces: SpaceInfo[];
  source: string;
  unsupported: Record<string, number>;
}

export type CadResponse =
  | { id: number; ok: true; result: OpenResult | DisplayList | null }
  | { id: number; ok: false; error: string };
