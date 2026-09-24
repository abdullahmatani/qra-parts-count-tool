// Generates a synthetic stand-in for the A2.1 parts count sheet (e2e/fixtures):
// the same labels, yellow input cells, protection, validation, merged note rows
// and hidden calculation columns, but placeholder leak frequencies and none of
// the original workbook's links or metadata. The real template is not kept in
// this repository. Run: node scripts/generate-a21-fixture.mjs
import ExcelJS from 'exceljs';

const OUT = new URL('../e2e/fixtures/A2.1_parts_count_sheet_synthetic.xlsx', import.meta.url);

const wb = new ExcelJS.Workbook();
wb.creator = 'Test fixture';
wb.created = new Date('2026-01-01T00:00:00Z');
wb.modified = new Date('2026-01-01T00:00:00Z');
const ws = wb.addWorksheet('PartsCountSheet', { views: [{ showZeros: false, zoomScale: 70 }] });

const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
const input = (ref, numFmt) => {
  const cell = ws.getCell(ref);
  cell.fill = YELLOW;
  cell.protection = { locked: false };
  if (numFmt) cell.numFmt = numFmt;
};

[32.6, 17.1, 13, 11.4, 15.4, 12.6, 12.6].forEach((width, i) => {
  ws.getColumn(i + 1).width = width;
});
for (let c = 8; c <= 19; c += 1) ws.getColumn(c).hidden = true;

// Results: hole sizes and frequencies per hole size.
ws.getCell('A1').value = 'Results';
ws.getCell('B1').value = 'Hole mm';
ws.getCell('B2').value = 'Freq/yr';
['C', 'D', 'E', 'F', 'G'].forEach((col, i) => {
  const hole = ['I', 'J', 'K', 'L', 'M'][i];
  const freq = ['N', 'O', 'P', 'Q', 'R'][i];
  ws.getCell(`${col}1`).value = { formula: `${hole}27` };
  ws.getCell(`${col}2`).value = { formula: `SUM(${freq}28:${freq}71)` };
  ws.getCell(`${col}2`).numFmt = '0.00E+00';
});

// Segment data.
const header = [
  ['A4', 'Isolatable section ID'],
  ['A5', 'Isolatable ID Description'],
  ['A6', 'Object/Equipment '],
  ['A7', 'PEFS numbers used'],
  ['A8', 'Stream Number'],
  ['A9', 'Operating Pressure'],
  ['A10', 'Operating Temperature '],
  ['A11', 'Phase (Liquid/Gas)'],
  ['A12', 'H2S Concentration '],
  ['A13', 'Mol.Weight/Density '],
];
for (const [ref, label] of header) {
  ws.getCell(ref).value = label;
  input(ref.replace('A', 'B'));
}
ws.getCell('B8').numFmt = '@';
ws.getCell('C9').value = 'bara';
ws.getCell('C10').value = 'C';
ws.getCell('C12').value = 'mole fraction ';
ws.getCell('C13').value = '(Put Molecular wt. for Gases & Density in kg/m3 for Liquids)';
ws.getCell('S74').value = 'Liquid';
ws.getCell('S75').value = 'Gas';
ws.getCell('B11').dataValidation = {
  type: 'list',
  allowBlank: true,
  showErrorMessage: true,
  formulae: ['$S$74:$S$75'],
};

// Counts by size.
const headings = {
  A15: '  Diameter',
  B15: 'Number of',
  C15: 'Number of Valves',
  E15: 'Number',
  F15: 'Number of ',
  G15: 'Length',
  B16: 'instrument',
  E16: 'of',
  F16: 'flanged',
  G16: 'of',
  B17: 'small bore',
  C17: 'Manual',
  D17: 'Actuated',
  E17: 'Flanges',
  F17: 'joints',
  G17: 'Pipes',
  C18: 'per item',
  D18: 'per item',
  E18: 'per flange face',
  F18: 'per joint',
  G18: 'per meter',
};
for (const [ref, text] of Object.entries(headings)) ws.getCell(ref).value = text;
['<=1/2"', '1/2" <= 1"', '>1"'].forEach((label, i) => {
  ws.getCell(`A${19 + i}`).value = label;
  input(`B${19 + i}`);
});
['<=1', '1" <= 2"', '2" <= 3"', '3" <= 11"', '>11"'].forEach((label, i) => {
  ws.getCell(`A${22 + i}`).value = label;
  for (const col of ['C', 'D', 'E', 'F', 'G']) input(`${col}${22 + i}`);
});

// Equipment counts, with placeholder frequencies and hole-size fractions.
ws.getCell('E27').value = 'Number';
ws.getCell('H27').value = 'Freq';
[2, 7, 22, 70, 150].forEach((mm, i) => {
  ws.getRow(27).getCell(9 + i).value = mm;
  ws.getRow(27).getCell(14 + i).value = { formula: `${String.fromCharCode(73 + i)}27` };
});
const equipment = [
  'Compressors centrifugal',
  'Compressors reciprocating',
  'Fin fan coolers',
  'Heat exchangersHC in shell',
  'Heat exchangers HC in tube',
  'Pressure vessel',
  'Pumps centrifugal (Double Seal)',
  'Pumps centrifugal (Single Seal)',
  'Pumps reciprocating',
  'Pipeline onshore / steel',
  'Pig launchers/receivers',
  'Xmas trees (<5000 psi)',
  'Xmas trees (>5000 psi)',
  'Plate & Frame HE',
];
const frequencies = (row) => {
  ws.getCell(`H${row}`).value = 1e-4;
  ws.getCell(`H${row}`).numFmt = '0.00E+00';
  ['I', 'J', 'K', 'L', 'M'].forEach((col, i) => {
    ws.getCell(`${col}${row}`).value = 0.2;
    ws.getCell(`${['N', 'O', 'P', 'Q', 'R'][i]}${row}`).value = {
      formula: `$E${row}*$H${row}*${col}${row}`,
    };
  });
};
equipment.forEach((name, i) => {
  const row = 28 + i;
  ws.getCell(`A${row}`).value = name;
  input(`E${row}`);
  ws.getCell(`F${row}`).value = name.startsWith('Pipeline') ? 'Per m length' : 'Per Item';
  frequencies(row);
});

// Hidden rows that bring the size counts into the frequency sums.
const sources = [
  ['Small bore', ['B19', 'B20', 'B21']],
  ['valve man', ['C22', 'C23', 'C24', 'C25', 'C26']],
  ['Valve act', ['D22', 'D23', 'D24', 'D25', 'D26']],
  ['Flanges', ['E22', 'E23', 'E24', 'E25', 'E26']],
  ['Joints', ['F22', 'F23', 'F24', 'F25', 'F26']],
  ['pipes', ['G22', 'G23', 'G24', 'G25', 'G26']],
];
let row = 44;
for (const [label, refs] of sources) {
  ws.getCell(`C${row}`).value = label;
  for (const ref of refs) {
    ws.getCell(`E${row}`).value = { formula: ref };
    frequencies(row);
    row += 1;
  }
}

// Notes: six merged lines.
ws.getCell('A72').value = 'Notes';
for (let r = 72; r <= 77; r += 1) {
  ws.mergeCells(`B${r}:G${r}`);
  input(`B${r}`);
}

await ws.protect('synthetic', { formatCells: true, formatColumns: true, formatRows: true });
await wb.xlsx.writeFile(OUT.pathname);
console.log(`wrote ${OUT.pathname}`);
