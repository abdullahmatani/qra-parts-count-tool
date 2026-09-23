/**
 * The sample study (roadmap #46): a two-sheet PEFS of an inlet separator and
 * the gas line to compression, marked up as a finished count would be. One
 * layout drives both the drawing (sample-drawing.ts) and the project
 * (sample-project.ts), so every marker sits on its symbol.
 *
 * Coordinates are drawing coordinates: points on an A3 landscape sheet,
 * origin top left, y down.
 */
import type { EquipmentCategory } from '@/domain/schema/types';

export const SHEET = { width: 1191, height: 842 } as const;

export type SymbolKind =
  | 'valve'
  | 'check'
  | 'esdv'
  | 'flange'
  | 'instrument'
  | 'vessel'
  | 'pump'
  | 'filter'
  | 'compressor';

export interface SampleItem {
  category: EquipmentCategory;
  actuation?: 'manual' | 'automated';
  /** Inches; omitted for unsized equipment, or deliberately missing to show a warning. */
  size?: number;
  remarks?: string;
}

export interface SampleSymbol {
  kind: SymbolKind;
  x: number;
  y: number;
  tag: string;
  /** Segment key the marker belongs to; ESDVs use `between` instead. */
  segment?: 'IS-01' | 'IS-02';
  item?: SampleItem;
  /** ESDV: [upstream, downstream] segment keys. */
  between?: [('IS-01' | 'IS-02') | null, ('IS-01' | 'IS-02') | null];
  esdvSize?: number;
  /** Tag text drawn on the sheet (defaults to `tag`). */
  showTag?: boolean;
}

export interface SampleConnector {
  x: number;
  y: number;
  text: string;
  /** Sheet index the connector leads to (a drawing link in the sample). */
  to: number;
  side: 'left' | 'right';
}

export interface SampleSheet {
  drawingNo: string;
  title: string;
  revision: string;
  sheet: string;
  lines: { points: [number, number][]; label?: { text: string; x: number; y: number } }[];
  symbols: SampleSymbol[];
  connectors: SampleConnector[];
  notes: { text: string; x: number; y: number }[];
}

export const SAMPLE_SEGMENTS = [
  {
    key: 'IS-01',
    description: 'Inlet separator V-100 and its outlets',
    fluid: 'Gas / condensate',
    phase: 'Two-phase',
    pressure: 45,
    temperature: 60,
    status: 'counted' as const,
    countedBy: 'QRA',
  },
  {
    key: 'IS-02',
    description: 'Separator gas to compressor suction',
    fluid: 'Gas',
    phase: 'Gas',
    pressure: 44,
    temperature: 55,
    status: 'inProgress' as const,
    countedBy: 'QRA',
  },
] as const;

export const SAMPLE_SHEETS: SampleSheet[] = [
  {
    drawingNo: 'PEFS-S-001',
    title: 'INLET SEPARATOR V-100',
    revision: 'A',
    sheet: '1',
    lines: [
      {
        points: [
          [70, 300],
          [470, 300],
        ],
        label: { text: '8"-P-1001-A1', x: 80, y: 290 },
      },
      {
        points: [
          [700, 240],
          [700, 150],
          [1040, 150],
        ],
        label: { text: '6"-G-1002-A1', x: 720, y: 140 },
      },
      {
        points: [
          [540, 360],
          [540, 560],
          [1040, 560],
        ],
        label: { text: '4"-P-1003-A1', x: 560, y: 550 },
      },
      {
        points: [
          [620, 360],
          [620, 440],
        ],
      },
      {
        points: [
          [400, 300],
          [400, 268],
        ],
      },
      {
        points: [
          [730, 360],
          [730, 400],
          [760, 400],
        ],
      },
    ],
    symbols: [
      {
        kind: 'esdv',
        x: 150,
        y: 300,
        tag: 'ESDV-101',
        between: [null, 'IS-01'],
        esdvSize: 8,
      },
      {
        kind: 'flange',
        x: 220,
        y: 300,
        tag: 'F-1',
        showTag: false,
        segment: 'IS-01',
        item: { category: 'flange', size: 8 },
      },
      {
        kind: 'valve',
        x: 280,
        y: 300,
        tag: 'HV-101',
        segment: 'IS-01',
        item: { category: 'valve', actuation: 'manual', size: 8 },
      },
      {
        kind: 'flange',
        x: 340,
        y: 300,
        tag: 'F-2',
        showTag: false,
        segment: 'IS-01',
        item: { category: 'flange', size: 8 },
      },
      {
        kind: 'instrument',
        x: 400,
        y: 252,
        tag: 'PT-101',
        segment: 'IS-01',
        item: { category: 'smallBore', size: 0.75, remarks: 'Instrument tap' },
      },
      {
        kind: 'vessel',
        x: 615,
        y: 300,
        tag: 'V-100',
        segment: 'IS-01',
        item: { category: 'vessel' },
      },
      {
        kind: 'valve',
        x: 620,
        y: 420,
        tag: 'HV-105',
        segment: 'IS-01',
        item: { category: 'valve', actuation: 'manual', size: 2, remarks: 'Drain' },
      },
      {
        kind: 'instrument',
        x: 776,
        y: 400,
        tag: 'LT-101',
        segment: 'IS-01',
        item: { category: 'smallBore', size: 1, remarks: 'Instrument tap' },
      },
      {
        kind: 'valve',
        x: 790,
        y: 150,
        tag: 'HV-102',
        segment: 'IS-01',
        item: { category: 'valve', actuation: 'manual', size: 6 },
      },
      {
        kind: 'flange',
        x: 850,
        y: 150,
        tag: 'F-3',
        showTag: false,
        segment: 'IS-01',
        item: { category: 'flange', size: 6 },
      },
      {
        kind: 'esdv',
        x: 920,
        y: 150,
        tag: 'ESDV-102',
        between: ['IS-01', 'IS-02'],
        esdvSize: 6,
      },
      {
        kind: 'valve',
        x: 990,
        y: 150,
        tag: 'HV-103',
        segment: 'IS-02',
        item: { category: 'valve', actuation: 'manual', size: 6 },
      },
      {
        kind: 'valve',
        x: 640,
        y: 560,
        tag: 'HV-104',
        segment: 'IS-01',
        item: { category: 'valve', actuation: 'manual', size: 4 },
      },
      {
        kind: 'pump',
        x: 760,
        y: 560,
        tag: 'P-101',
        segment: 'IS-01',
        item: { category: 'pump' },
      },
      {
        kind: 'check',
        x: 860,
        y: 560,
        tag: 'NRV-101',
        segment: 'IS-01',
        item: { category: 'valve', actuation: 'manual', size: 4, remarks: 'Check valve' },
      },
      {
        kind: 'esdv',
        x: 950,
        y: 560,
        tag: 'ESDV-103',
        between: ['IS-01', null],
        esdvSize: 4,
      },
    ],
    connectors: [
      { x: 1040, y: 150, text: 'TO PEFS-S-002', to: 1, side: 'right' },
      { x: 1040, y: 560, text: 'TO PW TREATMENT', to: -1, side: 'right' },
    ],
    notes: [{ text: 'FROM WELLHEAD MANIFOLD', x: 70, y: 330 }],
  },
  {
    drawingNo: 'PEFS-S-002',
    title: 'GAS COMPRESSOR SUCTION',
    revision: 'A',
    sheet: '1',
    lines: [
      {
        points: [
          [150, 300],
          [800, 300],
        ],
        label: { text: '6"-G-1002-A1', x: 160, y: 290 },
      },
      {
        points: [
          [450, 300],
          [450, 268],
        ],
      },
    ],
    symbols: [
      {
        kind: 'valve',
        x: 230,
        y: 300,
        tag: 'HV-201',
        segment: 'IS-02',
        item: { category: 'valve', actuation: 'manual', size: 6 },
      },
      {
        kind: 'flange',
        x: 290,
        y: 300,
        tag: 'F-4',
        showTag: false,
        segment: 'IS-02',
        // No size on the sheet: the pre-export check flags it.
        item: { category: 'flange', remarks: 'Size not shown; query raised' },
      },
      {
        kind: 'filter',
        x: 370,
        y: 300,
        tag: 'F-201',
        segment: 'IS-02',
        item: { category: 'filter' },
      },
      {
        kind: 'instrument',
        x: 450,
        y: 252,
        tag: 'PT-201',
        segment: 'IS-02',
        item: { category: 'smallBore', size: 0.5, remarks: 'Instrument tap' },
      },
      {
        kind: 'valve',
        x: 540,
        y: 300,
        tag: 'HV-202',
        segment: 'IS-02',
        item: { category: 'valve', actuation: 'manual', size: 6 },
      },
      {
        kind: 'esdv',
        x: 650,
        y: 300,
        tag: 'ESDV-201',
        between: ['IS-02', null],
        esdvSize: 6,
      },
      { kind: 'compressor', x: 860, y: 300, tag: 'K-201' },
    ],
    connectors: [{ x: 150, y: 300, text: 'FROM PEFS-S-001', to: 0, side: 'left' }],
    notes: [],
  },
];

/** Box of a connector's flag, for drawing it and for its drawing link. */
export function connectorBox(c: SampleConnector): { x: number; y: number; w: number; h: number } {
  const w = 120;
  const h = 26;
  return { x: c.side === 'right' ? c.x : c.x - w, y: c.y - h / 2, w, h };
}
