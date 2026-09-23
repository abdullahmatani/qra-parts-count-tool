// Generates a synthetic P&ID-style DXF drawing for tests (e2e/fixtures/PEFS-4001.dxf).
// It is written as AutoCAD R2000 (AC1015) ASCII DXF with handles, so both the
// app's DXF parser and LibreDWG can read it. Run: node scripts/generate-cad-fixtures.mjs
//
// The native DWG fixture (e2e/fixtures/PEFS-4001.dwg) is this drawing converted with
// LibreDWG's command-line tool (built from the 0.13.3 release source):
//   dxf2dwg -y --as r2000 -o e2e/fixtures/PEFS-4001.dwg e2e/fixtures/PEFS-4001.dxf
import { writeFile } from 'node:fs/promises';

let handle = 0x100;
const nextHandle = () => (handle++).toString(16).toUpperCase();
const lines = [];
const pair = (code, value) => lines.push(String(code).padStart(3, ' '), String(value));
const pairs = (...items) => {
  for (let i = 0; i < items.length; i += 2) pair(items[i], items[i + 1]);
};

// ---- geometry helpers (A1 landscape sheet in millimetres) -------------------
const W = 841;
const H = 594;
const MODEL = '1F';
const PAPER = '1E';

function entityHead(type, layer, owner = MODEL, extra = []) {
  pairs(0, type, 5, nextHandle(), 330, owner, 100, 'AcDbEntity', 8, layer, ...extra);
}
function line(x1, y1, x2, y2, layer = 'PIPE', owner) {
  entityHead('LINE', layer, owner);
  pairs(100, 'AcDbLine', 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0);
}
function lwpolyline(points, closed, layer, owner) {
  entityHead('LWPOLYLINE', layer, owner);
  pairs(100, 'AcDbPolyline', 90, points.length, 70, closed ? 1 : 0, 43, 0);
  for (const [x, y, bulge] of points) {
    pairs(10, x, 20, y);
    if (bulge) pairs(42, bulge);
  }
}
function circle(x, y, r, layer, owner) {
  entityHead('CIRCLE', layer, owner);
  pairs(100, 'AcDbCircle', 10, x, 20, y, 30, 0, 40, r);
}
function arc(x, y, r, a0, a1, layer, owner) {
  entityHead('ARC', layer, owner);
  pairs(100, 'AcDbCircle', 10, x, 20, y, 30, 0, 40, r, 100, 'AcDbArc', 50, a0, 51, a1);
}
function text(x, y, height, value, layer = 'TEXT', owner, align = 0) {
  entityHead('TEXT', layer, owner);
  pairs(100, 'AcDbText', 10, x, 20, y, 30, 0, 40, height, 1, value);
  if (align) pairs(72, align, 11, x, 21, y, 31, 0);
  pairs(100, 'AcDbText');
}
function mtext(x, y, height, value, layer = 'TEXT') {
  entityHead('MTEXT', layer);
  pairs(100, 'AcDbMText', 10, x, 20, y, 30, 0, 40, height, 41, 120, 71, 1, 1, value);
}
function insert(block, x, y, rotation = 0, attributes = []) {
  const owner = nextHandle();
  handle -= 1;
  entityHead('INSERT', 'PIPE');
  pairs(100, 'AcDbBlockReference');
  if (attributes.length) pairs(66, 1);
  pairs(2, block, 10, x, 20, y, 30, 0, 41, 1, 42, 1, 43, 1, 50, rotation);
  if (attributes.length) {
    for (const [tag, value, dx, dy] of attributes) {
      entityHead('ATTRIB', 'TEXT', owner);
      pairs(
        100,
        'AcDbText',
        10,
        x + dx,
        20,
        y + dy,
        30,
        0,
        40,
        2.5,
        1,
        value,
        100,
        'AcDbAttribute',
        2,
        tag,
        70,
        0,
      );
    }
    entityHead('SEQEND', 'PIPE', owner);
  }
}
function solidHatch(points, layer = 'PIPE', owner) {
  entityHead('HATCH', layer, owner);
  pairs(
    100,
    'AcDbHatch',
    10,
    0,
    20,
    0,
    30,
    0,
    210,
    0,
    220,
    0,
    230,
    1,
    2,
    'SOLID',
    70,
    1,
    71,
    0,
    91,
    1,
  );
  pairs(92, 2, 72, 0, 73, 1, 93, points.length);
  for (const [x, y] of points) pairs(10, x, 20, y);
  pairs(97, 0, 75, 0, 76, 1, 98, 0);
}

// ---- document --------------------------------------------------------------
pairs(0, 'SECTION', 2, 'HEADER');
pairs(
  9,
  '$ACADVER',
  1,
  'AC1015',
  9,
  '$HANDSEED',
  5,
  'FFFF',
  9,
  '$INSUNITS',
  70,
  4,
  9,
  '$LTSCALE',
  40,
  1,
);
pairs(9, '$EXTMIN', 10, 0, 20, 0, 30, 0, 9, '$EXTMAX', 10, W, 20, H, 30, 0);
pairs(0, 'ENDSEC');

pairs(0, 'SECTION', 2, 'TABLES');
// LTYPE
pairs(0, 'TABLE', 2, 'LTYPE', 5, '5', 100, 'AcDbSymbolTable', 70, 2);
pairs(
  0,
  'LTYPE',
  5,
  '14',
  100,
  'AcDbSymbolTableRecord',
  100,
  'AcDbLinetypeTableRecord',
  2,
  'CONTINUOUS',
  70,
  0,
  3,
  'Solid line',
  72,
  65,
  73,
  0,
  40,
  0,
);
pairs(
  0,
  'LTYPE',
  5,
  '15',
  100,
  'AcDbSymbolTableRecord',
  100,
  'AcDbLinetypeTableRecord',
  2,
  'DASHED',
  70,
  0,
  3,
  '__ __ __',
  72,
  65,
  73,
  2,
  40,
  9,
  49,
  6,
  74,
  0,
  49,
  -3,
  74,
  0,
);
pairs(0, 'ENDTAB');
// LAYER
pairs(0, 'TABLE', 2, 'LAYER', 5, '2', 100, 'AcDbSymbolTable', 70, 5);
for (const [name, color, lt, h] of [
  ['0', 7, 'CONTINUOUS', '10'],
  ['PIPE', 1, 'CONTINUOUS', '11'],
  ['INSTR', 5, 'DASHED', '12'],
  ['TEXT', 7, 'CONTINUOUS', '13'],
  ['TITLE', 7, 'CONTINUOUS', '16'],
]) {
  pairs(
    0,
    'LAYER',
    5,
    h,
    100,
    'AcDbSymbolTableRecord',
    100,
    'AcDbLayerTableRecord',
    2,
    name,
    70,
    0,
    62,
    color,
    6,
    lt,
    370,
    name === 'PIPE' ? 50 : -3,
  );
}
pairs(0, 'ENDTAB');
// STYLE
pairs(0, 'TABLE', 2, 'STYLE', 5, '3', 100, 'AcDbSymbolTable', 70, 1);
pairs(
  0,
  'STYLE',
  5,
  '17',
  100,
  'AcDbSymbolTableRecord',
  100,
  'AcDbTextStyleTableRecord',
  2,
  'STANDARD',
  70,
  0,
  40,
  0,
  41,
  1,
  50,
  0,
  71,
  0,
  42,
  2.5,
  3,
  'txt',
  4,
  '',
);
pairs(0, 'ENDTAB');
// BLOCK_RECORD
pairs(0, 'TABLE', 2, 'BLOCK_RECORD', 5, '1', 100, 'AcDbSymbolTable', 70, 5);
const blockRecords = [
  ['*Model_Space', MODEL],
  ['*Paper_Space', PAPER],
  ['VALVE', '20'],
  ['INSTR', '21'],
  ['FLANGE', '22'],
];
for (const [name, h] of blockRecords) {
  pairs(
    0,
    'BLOCK_RECORD',
    5,
    h,
    100,
    'AcDbSymbolTableRecord',
    100,
    'AcDbBlockTableRecord',
    2,
    name,
  );
}
pairs(0, 'ENDTAB');
pairs(0, 'ENDSEC');

// BLOCKS
pairs(0, 'SECTION', 2, 'BLOCKS');
function block(name, owner, body) {
  pairs(
    0,
    'BLOCK',
    5,
    nextHandle(),
    330,
    owner,
    100,
    'AcDbEntity',
    8,
    '0',
    100,
    'AcDbBlockBegin',
    2,
    name,
    70,
    0,
    10,
    0,
    20,
    0,
    30,
    0,
    3,
    name,
    1,
    '',
  );
  body(owner);
  pairs(0, 'ENDBLK', 5, nextHandle(), 330, owner, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd');
}
block('*Model_Space', MODEL, () => {});
block('*Paper_Space', PAPER, () => {});
block('VALVE', '20', (owner) => {
  // Bow-tie gate valve, 8 mm long, centred on the insertion point.
  lwpolyline(
    [
      [-4, -2],
      [-4, 2],
      [4, -2],
      [4, 2],
    ],
    true,
    '0',
    owner,
  );
});
block('INSTR', '21', (owner) => {
  circle(0, 0, 5, '0', owner);
  line(-5, 0, 5, 0, '0', owner);
});
block('FLANGE', '22', (owner) => {
  line(-0.75, -3, -0.75, 3, '0', owner);
  line(0.75, -3, 0.75, 3, '0', owner);
});
pairs(0, 'ENDSEC');

// ENTITIES
pairs(0, 'SECTION', 2, 'ENTITIES');
// Border and title block.
lwpolyline(
  [
    [10, 10],
    [W - 10, 10],
    [W - 10, H - 10],
    [10, H - 10],
  ],
  true,
  'TITLE',
);
const tbx = W - 190;
lwpolyline(
  [
    [tbx, 10],
    [W - 10, 10],
    [W - 10, 60],
    [tbx, 60],
  ],
  true,
  'TITLE',
);
line(tbx, 40, W - 10, 40, 'TITLE');
line(W - 50, 10, W - 50, 40, 'TITLE');
text(tbx + 3, 55, 2, 'TITLE', 'TITLE');
text(tbx + 3, 45, 4, 'GAS COMPRESSOR SUCTION DRUM', 'TITLE');
text(tbx + 3, 35, 2, 'DRAWING NO.', 'TITLE');
text(tbx + 3, 22, 7, 'PEFS-4001', 'TITLE');
text(tbx + 3, 13, 2, 'SHEET', 'TITLE');
text(tbx + 20, 13, 3, '1', 'TITLE');
text(W - 47, 35, 2, 'REV', 'TITLE');
text(W - 40, 20, 8, 'B', 'TITLE');

// Process lines with valves, flanges and instruments.
let tag = 4001;
for (let row = 0; row < 12; row += 1) {
  const y = 110 + row * 38;
  const x0 = 60;
  const x1 = W - 80;
  line(x0, y, x1, y, 'PIPE');
  text(x0 + 4, y + 2, 2.5, `${2 + (row % 6)}"-P-${4100 + row}-A1`);
  for (let k = 0; k < 6; k += 1) {
    const x = x0 + 60 + k * 110;
    if (k % 3 === 0) {
      insert('VALVE', x, y, 0, [['TAG', `HV-${tag}`, -6, -8]]);
      tag += 1;
    } else if (k % 3 === 1) {
      insert('FLANGE', x, y);
    } else {
      line(x, y, x, y + 18, 'INSTR');
      insert('INSTR', x, y + 23, 0, [['TAG', `PT-${tag}`, -4, -1]]);
      tag += 1;
    }
  }
  // A closed (solid) check valve indicator.
  solidHatch([
    [x1 - 20, y - 2],
    [x1 - 12, y],
    [x1 - 20, y + 2],
  ]);
}
arc(420, 70, 25, 0, 180, 'PIPE');
mtext(40, 80, 2.5, 'NOTES:\\P1. ALL VALVES TO BE LOCKED OPEN.\\P2. {\\fArial|b1;SEE} PEFS-4002.');
text(W - 150, H - 30, 3, 'TO PEFS-4002', 'TEXT');
pairs(0, 'ENDSEC');

// OBJECTS: minimal dictionary and layouts so readers that expect them are satisfied.
pairs(0, 'SECTION', 2, 'OBJECTS');
pairs(
  0,
  'DICTIONARY',
  5,
  'C',
  330,
  '0',
  100,
  'AcDbDictionary',
  281,
  1,
  3,
  'ACAD_LAYOUT',
  350,
  '1A',
);
pairs(
  0,
  'DICTIONARY',
  5,
  '1A',
  330,
  'C',
  100,
  'AcDbDictionary',
  281,
  1,
  3,
  'Model',
  350,
  '22A',
  3,
  'Layout1',
  350,
  '1B',
);
for (const [h, name, tab, record] of [
  ['22A', 'Model', 0, MODEL],
  ['1B', 'Layout1', 1, PAPER],
]) {
  pairs(
    0,
    'LAYOUT',
    5,
    h,
    330,
    '1A',
    100,
    'AcDbPlotSettings',
    1,
    '',
    2,
    'none_device',
    4,
    '',
    6,
    '',
    40,
    0,
    41,
    0,
    42,
    0,
    43,
    0,
    44,
    0,
    45,
    0,
    46,
    0,
    47,
    0,
    48,
    0,
    49,
    0,
    140,
    0,
    141,
    0,
    142,
    1,
    143,
    1,
    70,
    688,
    72,
    1,
    73,
    0,
    74,
    5,
    7,
    '',
    75,
    16,
    147,
    1,
    148,
    0,
    149,
    0,
  );
  pairs(
    100,
    'AcDbLayout',
    1,
    name,
    70,
    1,
    71,
    tab,
    10,
    0,
    20,
    0,
    11,
    420,
    21,
    297,
    12,
    0,
    22,
    0,
    32,
    0,
    14,
    0,
    24,
    0,
    34,
    0,
    15,
    0,
    25,
    0,
    35,
    0,
    146,
    0,
    13,
    0,
    23,
    0,
    33,
    0,
    16,
    1,
    26,
    0,
    36,
    0,
    17,
    0,
    27,
    1,
    37,
    0,
    76,
    0,
    330,
    record,
  );
}
pairs(0, 'ENDSEC');
pairs(0, 'EOF');

const out = new URL('../e2e/fixtures/PEFS-4001.dxf', import.meta.url);
await writeFile(out, `${lines.join('\r\n')}\r\n`);
console.log(
  `wrote e2e/fixtures/PEFS-4001.dxf (${(lines.join('\r\n').length / 1024).toFixed(0)} kB, ${tag - 4001} tags)`,
);
