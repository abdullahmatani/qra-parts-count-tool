/**
 * The starter library (CNT-02, CNT-04): the equipment types and size bins of
 * the A2.1 parts count sheet, the QRA template in use, so a new project's
 * counts land in that sheet without changes (see `domain/export/a21.ts`).
 * No leak frequency dataset is built in; everything here can be edited.
 */
import { newId } from '@/lib/ids';
import type { Bin, BinSet, EquipmentCategory, EquipmentType, Library } from '../schema/types';
import { binLabel } from './bins';

export type Edge = [lower: number | null, upper: number | null];

/** Bins from edges: each bin is lower < x ≤ upper, the first ≤ upper, the last > lower. */
function bins(edges: readonly Edge[]): Bin[] {
  return edges.map(([lower, upper]) => {
    const bin = { lower, lowerInclusive: false, upper, upperInclusive: true };
    return { id: newId('bin'), label: binLabel(bin), ...bin };
  });
}

/** A2.1 rows 22–26 (valves, flanges, joints, pipe): ≤ 1", 1"–2", 2"–3", 3"–11", > 11". */
export const A21_SIZE_EDGES: readonly Edge[] = [
  [null, 1],
  [1, 2],
  [2, 3],
  [3, 11],
  [11, null],
];
/** A2.1 rows 19–21 (small-bore instrument connections): ≤ ½", ½"–1", > 1". */
export const A21_SMALL_BORE_EDGES: readonly Edge[] = [
  [null, 0.5],
  [0.5, 1],
  [1, null],
];

/** Equipment counted per item (or per metre) in A2.1 rows 28–41, by Excel key. */
export const A21_EQUIPMENT: readonly {
  excelKey: string;
  name: string;
  category: EquipmentCategory;
  row: number;
}[] = [
  {
    excelKey: 'compressorCentrifugal',
    name: 'Compressor, centrifugal',
    category: 'compressor',
    row: 28,
  },
  {
    excelKey: 'compressorReciprocating',
    name: 'Compressor, reciprocating',
    category: 'compressor',
    row: 29,
  },
  { excelKey: 'finFanCooler', name: 'Fin fan cooler', category: 'heatExchanger', row: 30 },
  {
    excelKey: 'heatExchangerShell',
    name: 'Heat exchanger, HC in shell',
    category: 'heatExchanger',
    row: 31,
  },
  {
    excelKey: 'heatExchangerTube',
    name: 'Heat exchanger, HC in tube',
    category: 'heatExchanger',
    row: 32,
  },
  { excelKey: 'vessel', name: 'Pressure vessel', category: 'vessel', row: 33 },
  {
    excelKey: 'pumpDoubleSeal',
    name: 'Pump, centrifugal (double seal)',
    category: 'pump',
    row: 34,
  },
  {
    excelKey: 'pumpSingleSeal',
    name: 'Pump, centrifugal (single seal)',
    category: 'pump',
    row: 35,
  },
  { excelKey: 'pumpReciprocating', name: 'Pump, reciprocating', category: 'pump', row: 36 },
  { excelKey: 'pipeline', name: 'Pipeline, onshore steel (per m)', category: 'other', row: 37 },
  { excelKey: 'pigTrap', name: 'Pig launcher / receiver', category: 'pigTrap', row: 38 },
  { excelKey: 'xmasTreeLow', name: 'Xmas tree (< 5000 psi)', category: 'other', row: 39 },
  { excelKey: 'xmasTreeHigh', name: 'Xmas tree (> 5000 psi)', category: 'other', row: 40 },
  {
    excelKey: 'plateHeatExchanger',
    name: 'Plate and frame heat exchanger',
    category: 'heatExchanger',
    row: 41,
  },
];

function binSet(name: string, edges: readonly Edge[]): BinSet {
  return { id: newId('bns'), name, bins: bins(edges) };
}

function type(
  name: string,
  category: EquipmentCategory,
  binSetId: string,
  options: Partial<EquipmentType> = {},
): EquipmentType {
  return {
    id: newId('eqt'),
    name,
    category,
    hasActuation: false,
    binSetId,
    actuationBinSetIds: { manual: null, automated: null },
    sizeRequired: true,
    excelKey: '',
    datasetCategory: '',
    shortcut: null,
    ...options,
  };
}

export function starterLibrary(): Library {
  const automated = binSet('Valves, automated', A21_SIZE_EDGES);
  const manual = binSet('Valves, manual', A21_SIZE_EDGES);
  const flanges = binSet('Flanges', A21_SIZE_EDGES);
  const smallBore = binSet('Small-bore connections', A21_SMALL_BORE_EDGES);
  const pipe = binSet('Pipe', A21_SIZE_EDGES);
  const equipment: BinSet = {
    id: newId('bns'),
    name: 'Equipment (any size)',
    bins: [
      {
        id: newId('bin'),
        label: 'All sizes',
        lower: null,
        lowerInclusive: true,
        upper: null,
        upperInclusive: true,
      },
    ],
  };
  const valve = type('Valve', 'valve', manual.id, {
    hasActuation: true,
    actuationBinSetIds: { manual: manual.id, automated: automated.id },
    excelKey: 'valve',
    shortcut: '1',
  });
  // Shortcuts for the equipment met most often on a PEFS.
  const shortcuts: Record<string, string> = { vessel: '4', pumpSingleSeal: '5' };
  const types = [
    valve,
    type('Flange', 'flange', flanges.id, { excelKey: 'flange', shortcut: '2' }),
    type('Small-bore instrument connection', 'smallBore', smallBore.id, {
      excelKey: 'smallBore',
      shortcut: '3',
    }),
    ...A21_EQUIPMENT.map((e) =>
      type(e.name, e.category, equipment.id, {
        sizeRequired: false,
        excelKey: e.excelKey,
        shortcut: shortcuts[e.excelKey] ?? null,
      }),
    ),
    type('Pipe', 'pipe', pipe.id, { excelKey: 'pipe' }),
  ];
  return {
    datasetName: '',
    datasetDescription: '',
    equipmentTypes: types,
    binSets: [automated, manual, flanges, smallBore, pipe, equipment],
    // ESDVs count as automated valves under the boundary rule (SEG-08).
    esdvEquipmentTypeId: valve.id,
  };
}
