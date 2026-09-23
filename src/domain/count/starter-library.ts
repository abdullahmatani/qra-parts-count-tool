/**
 * The starter library (CNT-02, CNT-04): generic equipment types and bin sets
 * to begin a project with. No leak frequency dataset is built in; the user
 * names the dataset and edits everything here to match it.
 */
import { newId } from '@/lib/ids';
import type { Bin, BinSet, EquipmentCategory, EquipmentType, Library } from '../schema/types';
import { binLabel } from './bins';

type Edge = [lower: number | null, upper: number | null];

/** Bins from edges: each bin is lower < x ≤ upper, the first ≤ upper, the last > lower. */
function bins(edges: Edge[]): Bin[] {
  return edges.map(([lower, upper]) => {
    const bin = { lower, lowerInclusive: false, upper, upperInclusive: true };
    return { id: newId('bin'), label: binLabel(bin), ...bin };
  });
}

/** The example edges from the FDS: ≤ 1", 1"–2", 2"–3", 3"–6", 6"–11", > 11". */
const STANDARD: Edge[] = [
  [null, 1],
  [1, 2],
  [2, 3],
  [3, 6],
  [6, 11],
  [11, null],
];
const SMALL_BORE: Edge[] = [
  [null, 0.5],
  [0.5, 1],
  [1, 2],
];

function binSet(name: string, edges: Edge[]): BinSet {
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
  const automated = binSet('Valves, automated', STANDARD);
  const manual = binSet('Valves, manual', STANDARD);
  const flanges = binSet('Flanges', STANDARD);
  const smallBore = binSet('Small-bore connections', SMALL_BORE);
  const pipe = binSet('Pipe', STANDARD);
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
  const unsized = { sizeRequired: false };
  const valve = type('Valve', 'valve', manual.id, {
    hasActuation: true,
    actuationBinSetIds: { manual: manual.id, automated: automated.id },
    excelKey: 'valve',
    shortcut: '1',
  });
  const types = [
    valve,
    type('Flange', 'flange', flanges.id, { excelKey: 'flange', shortcut: '2' }),
    type('Small-bore instrument connection', 'smallBore', smallBore.id, {
      excelKey: 'smallBore',
      shortcut: '3',
    }),
    type('Pump', 'pump', equipment.id, { ...unsized, excelKey: 'pump', shortcut: '4' }),
    type('Compressor', 'compressor', equipment.id, { ...unsized, excelKey: 'compressor' }),
    type('Pressure vessel', 'vessel', equipment.id, { ...unsized, excelKey: 'vessel' }),
    type('Heat exchanger', 'heatExchanger', equipment.id, {
      ...unsized,
      excelKey: 'heatExchanger',
    }),
    type('Filter', 'filter', equipment.id, { ...unsized, excelKey: 'filter' }),
    type('Pig trap', 'pigTrap', equipment.id, { ...unsized, excelKey: 'pigTrap' }),
    type('Other equipment', 'other', equipment.id, { ...unsized, excelKey: 'other' }),
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
