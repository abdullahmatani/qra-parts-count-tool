// Generates a client-style Excel template for tests (e2e/fixtures). It imitates
// a per-segment parts count sheet: a header block, a count table with size-bin
// columns and total formulas, and a second sheet of frequencies with a named
// range. Run: node scripts/generate-excel-fixtures.mjs
import ExcelJS from 'exceljs';

const OUT = new URL('../e2e/fixtures/Client_template.xlsx', import.meta.url);

const wb = new ExcelJS.Workbook();
wb.creator = 'Test fixture';
wb.created = new Date('2026-01-01T00:00:00Z');
wb.modified = new Date('2026-01-01T00:00:00Z');

const master = wb.addWorksheet('Master');
master.getColumn(1).width = 30;
master.getCell('A1').value = 'PARTS COUNT';
master.getCell('A1').font = { bold: true, size: 14 };
master.getCell('A2').value = 'Project';
master.getCell('A3').value = 'Segment';
master.getCell('A4').value = 'Fluid';
master.getCell('A5').value = 'Bounding ESDVs';
master.mergeCells('B3:D3');
master.getCell('B3').font = { bold: true, color: { argb: 'FF1F4E79' } };

const bins = ['≤ 1"', '1" < x ≤ 2"', '2" < x ≤ 3"', '3" < x ≤ 6"', '6" < x ≤ 11"', '> 11"'];
master.getCell('A13').value = 'Equipment';
bins.forEach((label, i) => {
  const cell = master.getRow(13).getCell(3 + i);
  cell.value = label;
  cell.font = { bold: true };
});
master.getCell('I13').value = 'Total';
const rows = ['Valve, automated', 'Valve, manual', 'Flange', 'Small-bore connection'];
rows.forEach((label, r) => {
  const row = 14 + r;
  master.getCell(`A${row}`).value = label;
  for (let c = 0; c < bins.length; c += 1) {
    const cell = master.getRow(row).getCell(3 + c);
    cell.numFmt = '0';
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  }
  master.getCell(`I${row}`).value = { formula: `SUM(C${row}:H${row})` };
});
master.getCell('A40').value = 'Notes';

const frequencies = wb.addWorksheet('Frequencies');
frequencies.getCell('A1').value = 'Leak frequency dataset';
frequencies.getCell('B1').value = 'Client scheme 2024';
wb.definedNames.add('Frequencies!$B$1', 'DatasetName');

await wb.xlsx.writeFile(OUT.pathname);
console.log(`wrote ${OUT.pathname}`);
