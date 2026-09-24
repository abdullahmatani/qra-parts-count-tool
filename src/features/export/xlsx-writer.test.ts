// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { ExcelPlan } from '@/domain/export/excel-plan';
import { createZip, readZip } from '@/lib/zip';
import { templateSheetNames, writeWorkbook } from './xlsx-writer';

/** A small client-style template made with ExcelJS: a styled master sheet and a data sheet. */
async function exceljsTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const master = wb.addWorksheet('Master');
  master.getCell('A1').value = 'Segment';
  master.mergeCells('B1:C1');
  master.getCell('B1').font = { bold: true, color: { argb: 'FF1F4E79' } };
  master.getCell('D14').numFmt = '0';
  master.getCell('D14').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  master.getCell('F14').value = { formula: 'D14*2' };
  master.getColumn(1).width = 22;
  const other = wb.addWorksheet('Frequencies');
  other.getCell('A1').value = 'Leak frequency data';
  wb.definedNames.add('Frequencies!$A$1', 'DatasetTitle');
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const plan: ExcelPlan = {
  copies: [
    { source: 'Master', name: 'IS-01' },
    { source: 'Master', name: 'IS-02' },
  ],
  removeSheets: ['Master'],
  writes: [
    { sheet: 'IS-01', address: 'B1', value: 'IS-01' },
    { sheet: 'IS-01', address: 'D14', value: 7 },
    { sheet: 'IS-02', address: 'B1', value: 'IS-02' },
    { sheet: 'IS-02', address: 'D14', value: 0 },
  ],
  extraSheets: [
    {
      name: 'Notes',
      columns: [
        { header: 'Segment', width: 14 },
        { header: 'Note', width: 90 },
      ],
      rows: [['IS-01', 'Line 1\nLine 2']],
    },
  ],
  unmapped: [],
  warnings: [],
};

async function load(bytes: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  return wb;
}

// ---------------------------------------------------------------------------
// A hand-written package with what client templates carry and ExcelJS loses:
// external links, protected ranges, custom XML, a calculation chain and
// printer settings (compare the A2.1 parts count sheet).
// ---------------------------------------------------------------------------

const NS =
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const MASTER_SHEET =
  `${XML}<worksheet ${NS} xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" xr:uid="{11111111-2222-4333-8444-555555555555}">` +
  '<dimension ref="A1:H72"/><sheetViews><sheetView showZeros="0" tabSelected="1" workbookViewId="0"/></sheetViews>' +
  '<sheetFormatPr defaultRowHeight="12.75"/><cols><col min="1" max="1" width="32" customWidth="1"/><col min="8" max="8" width="10" hidden="1" customWidth="1"/></cols>' +
  '<sheetData>' +
  '<row r="4" spans="1:8"><c r="A4" s="0" t="s"><v>0</v></c><c r="B4" s="1"/></row>' +
  '<row r="9" spans="1:8"><c r="A9" t="s"><v>1</v></c><c r="B9" s="1"/><c r="C9" t="s"><v>2</v></c></row>' +
  '<row r="22" spans="1:8"><c r="C22" s="2"/><c r="D22" s="2"/><c r="H22"><f>C22*2</f><v>0</v></c></row>' +
  '<row r="72" spans="1:8"><c r="B72" s="1"/><c r="C72" s="1"/></row>' +
  '</sheetData>' +
  '<sheetProtection algorithmName="SHA-512" hashValue="AAAA" saltValue="BBBB" spinCount="100000" sheet="1" formatCells="0"/>' +
  '<protectedRanges><protectedRange sqref="B4:B13" name="ID Section"/></protectedRanges>' +
  '<mergeCells count="1"><mergeCell ref="B72:G72"/></mergeCells>' +
  '<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="B11" xr:uid="{66666666-7777-4888-9999-AAAAAAAAAAAA}"><formula1>$S$74:$S$75</formula1></dataValidation></dataValidations>' +
  '<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/>' +
  '<pageSetup orientation="portrait" r:id="rId1"/><headerFooter><oddHeader>&amp;C&amp;A</oddHeader></headerFooter>' +
  '</worksheet>';

const FIXTURE: Record<string, string> = {
  '[Content_Types].xml':
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>' +
    '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>',
  '_rels/.rels':
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
    '</Relationships>',
  'docProps/app.xml': `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>`,
  'customXml/item1.xml': `${XML}<ct:contentTypeSchema xmlns:ct="http://schemas.microsoft.com/office/2006/metadata/contentType"/>`,
  'customXml/itemProps1.xml': `${XML}<ds:datastoreItem ds:itemID="{1}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>`,
  'customXml/_rels/item1.xml.rels':
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/customXmlProps" Target="itemProps1.xml"/></Relationships>`,
  'xl/workbook.xml':
    `${XML}<workbook ${NS}><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="29040" windowHeight="15720"/></bookViews>` +
    '<sheets><sheet name="PartsCountSheet" sheetId="3" r:id="rId1"/><sheet name="Frequencies" sheetId="4" r:id="rId2"/></sheets>' +
    '<externalReferences><externalReference r:id="rId5"/></externalReferences>' +
    '<definedNames>' +
    '<definedName name="_xlnm.Print_Area" localSheetId="0">PartsCountSheet!$A$1:$G$77</definedName>' +
    '<definedName name="A_bub">&apos;[1]Vessel calculations&apos;!$C$7</definedName>' +
    '<definedName name="Freq">Frequencies!$A$1</definedName>' +
    '<definedName name="MasterInput">PartsCountSheet!$B$4</definedName>' +
    '</definedNames><calcPr calcId="191029"/></workbook>',
  'xl/_rels/workbook.xml.rels':
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId4" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
    `<Relationship Id="rId5" Type="${REL}/externalLink" Target="externalLinks/externalLink1.xml"/>` +
    `<Relationship Id="rId6" Type="${REL}/calcChain" Target="calcChain.xml"/>` +
    `<Relationship Id="rId7" Type="${REL}/customXml" Target="../customXml/item1.xml"/>` +
    '</Relationships>',
  'xl/worksheets/sheet1.xml': MASTER_SHEET,
  'xl/worksheets/_rels/sheet1.xml.rels':
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/printerSettings" Target="../printerSettings/printerSettings1.bin"/></Relationships>`,
  'xl/printerSettings/printerSettings1.bin': 'printer settings',
  'xl/worksheets/sheet2.xml': `${XML}<worksheet ${NS}><sheetData><row r="1"><c r="A1"><v>0.019</v></c></row></sheetData></worksheet>`,
  'xl/externalLinks/externalLink1.xml': `${XML}<externalLink ${NS}><externalBook r:id="rId1"><sheetNames><sheetName val="Vessel calculations"/></sheetNames></externalBook></externalLink>`,
  'xl/externalLinks/_rels/externalLink1.xml.rels':
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/externalLinkPath" Target="file:///C:\\HMB.xls" TargetMode="External"/></Relationships>`,
  'xl/styles.xml':
    `${XML}<styleSheet ${NS}><fonts count="1"><font><sz val="10"/><name val="Arial"/></font></fonts>` +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor indexed="43"/></patternFill></fill></fills>' +
    '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1" applyProtection="1"><protection locked="0"/></xf>' +
    '<xf numFmtId="1" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1" applyProtection="1"><protection locked="0"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  'xl/sharedStrings.xml': `${XML}<sst ${NS} count="3" uniqueCount="3"><si><t>Isolatable section ID</t></si><si><t>Operating Pressure</t></si><si><t>bara</t></si></sst>`,
  'xl/calcChain.xml': `${XML}<calcChain ${NS}><c r="H22" i="3"/></calcChain>`,
};

async function fixture(): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const zip = await createZip(
    Object.entries(FIXTURE).map(([name, text]) => ({ name, data: encoder.encode(text) })),
  );
  return zip.arrayBuffer();
}

async function parts(bytes: ArrayBuffer): Promise<Map<string, string>> {
  const decoder = new TextDecoder();
  return new Map((await readZip(bytes)).map((e) => [e.name, decoder.decode(e.data)]));
}

const a21Plan: ExcelPlan = {
  copies: [
    { source: 'PartsCountSheet', name: 'IS-01' },
    { source: 'PartsCountSheet', name: 'IS-02' },
  ],
  removeSheets: ['PartsCountSheet'],
  writes: [
    { sheet: 'IS-01', address: 'B4', value: 'IS-01' },
    { sheet: 'IS-01', address: 'B9', value: 42.5 },
    { sheet: 'IS-01', address: 'C22', value: 3 },
    { sheet: 'IS-01', address: 'B72', value: 'Note <1> & "2"' },
    { sheet: 'IS-02', address: 'B4', value: 'IS-02' },
    { sheet: 'IS-02', address: 'C22', value: 0 },
    { sheet: 'IS-02', address: 'E22', value: 5 },
  ],
  extraSheets: [],
  unmapped: [],
  warnings: [],
};

describe('XML-level Excel writer (EXP-02)', () => {
  it('fills copies of the master in its place and keeps formatting, formulas and other sheets', async () => {
    const template = { bytes: await exceljsTemplate(), fileName: 'client.xlsx' };
    expect(await templateSheetNames(template)).toEqual(['Master', 'Frequencies']);
    const wb = await load(await writeWorkbook(template, plan));
    expect(wb.worksheets.map((s) => s.name)).toEqual(['IS-01', 'IS-02', 'Frequencies', 'Notes']);
    const is01 = wb.getWorksheet('IS-01')!;
    expect(is01.getCell('A1').value).toBe('Segment');
    expect(is01.getCell('B1').value).toBe('IS-01');
    expect(is01.getCell('B1').font?.bold).toBe(true);
    expect(is01.getCell('B1').isMerged).toBe(true);
    expect(is01.getCell('D14').value).toBe(7);
    expect(is01.getCell('D14').fill).toMatchObject({ fgColor: { argb: 'FFFFF2CC' } });
    expect(is01.getCell('F14').value).toMatchObject({ formula: 'D14*2' });
    expect(is01.getColumn(1).width).toBe(22);
    expect(wb.getWorksheet('IS-02')!.getCell('D14').value).toBe(0);
    expect(wb.getWorksheet('Frequencies')!.getCell('A1').value).toBe('Leak frequency data');
    expect(wb.definedNames.getNames('Frequencies!$A$1')).toContain('DatasetTitle');
    const notes = wb.getWorksheet('Notes')!;
    expect(notes.getCell('A1').value).toBe('Segment');
    expect(notes.getCell('A1').font?.bold).toBe(true);
    expect(notes.getCell('B2').value).toBe('Line 1\nLine 2');
  });

  it('copies the style of another cell (block per segment)', async () => {
    const template = { bytes: await exceljsTemplate(), fileName: 'client.xlsx' };
    const out = await writeWorkbook(template, {
      ...plan,
      copies: [],
      removeSheets: [],
      extraSheets: [],
      writes: [{ sheet: 'Master', address: 'D39', value: 3, styleFrom: 'D14' }],
    });
    const cell = (await load(out)).getWorksheet('Master')!.getCell('D39');
    expect(cell.value).toBe(3);
    expect(cell.fill).toMatchObject({ fgColor: { argb: 'FFFFF2CC' } });
  });

  it('writes a new workbook when there is no template', async () => {
    const out = await writeWorkbook(null, { ...plan, copies: [], removeSheets: [], writes: [] });
    const wb = await load(out);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Notes']);
    expect(wb.getWorksheet('Notes')!.getCell('B2').value).toBe('Line 1\nLine 2');
  });

  it('refuses macro-enabled and unreadable templates, missing sheets and formula cells', async () => {
    const bytes = await exceljsTemplate();
    await expect(writeWorkbook({ bytes, fileName: 'client.xlsm' }, plan)).rejects.toMatchObject({
      kind: 'macro',
    });
    await expect(
      writeWorkbook(
        { bytes: new TextEncoder().encode('not excel').buffer, fileName: 'x.xlsx' },
        plan,
      ),
    ).rejects.toMatchObject({ kind: 'unreadable' });
    await expect(
      writeWorkbook(
        { bytes, fileName: 'client.xlsx' },
        { ...plan, copies: [{ source: 'Nope', name: 'X' }] },
      ),
    ).rejects.toMatchObject({ kind: 'missingSheet' });
    await expect(
      writeWorkbook(
        { bytes, fileName: 'client.xlsx' },
        {
          ...plan,
          copies: [],
          removeSheets: [],
          writes: [{ sheet: 'Master', address: 'F14', value: 1 }],
        },
      ),
    ).rejects.toMatchObject({ kind: 'formulaCell', message: 'Master!F14' });
  });

  it('touches only the written cells of an A2.1-style template', async () => {
    const out = await writeWorkbook({ bytes: await fixture(), fileName: 'A2.1.xlsx' }, a21Plan);
    const before = new Map(Object.entries(FIXTURE));
    const after = await parts(out);

    // Everything but the workbook, its sheet list and the stale calculation chain is as it was.
    const changed = [
      '[Content_Types].xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/_rels/sheet1.xml.rels',
      'xl/printerSettings/printerSettings1.bin',
      'xl/calcChain.xml',
    ];
    for (const [name, text] of before) {
      if (!changed.includes(name)) expect(after.get(name), name).toBe(text);
    }
    expect(after.has('xl/calcChain.xml')).toBe(false);

    const workbook = after.get('xl/workbook.xml')!;
    expect(workbook).toContain('<sheet name="IS-01" sheetId="5"');
    expect(workbook).toContain('<sheet name="IS-02" sheetId="6"');
    expect(workbook).not.toContain('PartsCountSheet"');
    expect(workbook.indexOf('IS-02')).toBeLessThan(workbook.indexOf('Frequencies'));
    expect(workbook).toContain(
      '<externalReferences><externalReference r:id="rId5"/></externalReferences>',
    );
    expect(workbook).toContain(
      '<definedName name="A_bub">&apos;[1]Vessel calculations&apos;!$C$7</definedName>',
    );
    // Each segment sheet prints like the master; a name pointing at the master becomes #REF!.
    expect(workbook).toContain(
      `<definedName name="_xlnm.Print_Area" localSheetId="0">'IS-01'!$A$1:$G$77</definedName>`,
    );
    expect(workbook).toContain(
      `<definedName name="_xlnm.Print_Area" localSheetId="1">'IS-02'!$A$1:$G$77</definedName>`,
    );
    expect(workbook).toContain('<definedName name="MasterInput">#REF!</definedName>');
    expect(workbook).toContain('<calcPr calcId="191029" fullCalcOnLoad="1"/>');
    expect(workbook).toContain('<definedName name="Freq">Frequencies!$A$1</definedName>');

    const rels = after.get('xl/_rels/workbook.xml.rels')!;
    expect(rels).toContain('Target="externalLinks/externalLink1.xml"');
    expect(rels).toContain('Target="../customXml/item1.xml"');
    expect(rels).not.toContain('calcChain');
    const types = after.get('[Content_Types].xml')!;
    expect(types).not.toContain('/xl/worksheets/sheet1.xml"');
    expect(types).not.toContain('calcChain');

    const sheetParts = [...after.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    expect(sheetParts.sort()).toEqual([
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet3.xml',
      'xl/worksheets/sheet4.xml',
    ]);
    const is01 = after.get('xl/worksheets/sheet3.xml')!;
    const is02 = after.get('xl/worksheets/sheet4.xml')!;
    // Written cells keep their style; text is an inline string, so shared strings are untouched.
    expect(is01).toContain(
      '<c r="B4" s="1" t="inlineStr"><is><t xml:space="preserve">IS-01</t></is></c>',
    );
    expect(is01).toContain('<c r="B9" s="1"><v>42.5</v></c>');
    expect(is01).toContain(
      '<c r="C22" s="2"><v>3</v></c><c r="D22" s="2"/><c r="H22"><f>C22*2</f><v>0</v></c>',
    );
    expect(is01).toContain('<t xml:space="preserve">Note &lt;1&gt; &amp; &quot;2&quot;</t>');
    expect(is02).toContain(
      '<c r="C22" s="2"><v>0</v></c><c r="D22" s="2"/><c r="E22"><v>5</v></c>',
    );
    // The first copy is the selected tab; the rest of each copy is the master's XML.
    expect(is01).toContain('tabSelected="1"');
    expect(is02).not.toContain('tabSelected');
    const masterTail = MASTER_SHEET.slice(MASTER_SHEET.indexOf('</sheetData>'));
    for (const sheet of [is01, is02]) {
      const tail = sheet.slice(sheet.indexOf('</sheetData>'));
      expect(tail.replace(/\{[0-9A-F-]+\}/g, '{uid}')).toBe(
        masterTail.replace(/\{[0-9A-F-]+\}/g, '{uid}'),
      );
    }
    // Each copy has its own printer settings; the master's went with it.
    expect(after.get('xl/worksheets/_rels/sheet3.xml.rels')).toContain(
      '../printerSettings/printerSettings2.bin',
    );
    expect(after.get('xl/worksheets/_rels/sheet4.xml.rels')).toContain(
      '../printerSettings/printerSettings3.bin',
    );
    expect(after.get('xl/printerSettings/printerSettings2.bin')).toBe('printer settings');
    expect(after.has('xl/printerSettings/printerSettings1.bin')).toBe(false);

    // ExcelJS reads it back.
    const wb = await load(out);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['IS-01', 'IS-02', 'Frequencies']);
    expect(wb.getWorksheet('IS-01')!.getCell('B9').value).toBe(42.5);
  });

  // LibreOffice Calc, where installed, opens the result and recalculates it.
  const soffice = ['/usr/bin/soffice', '/usr/local/bin/soffice'].find(
    (p) => existsSync(p) && existsSync('/usr/lib/libreoffice/program/libsclo.so'),
  );
  it.skipIf(!soffice)(
    'opens in LibreOffice with formulas recalculated',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'xlsx-writer-'));
      // Excel honours fullCalcOnLoad; LibreOffice is told to recalculate .xlsx files on load.
      mkdirSync(join(dir, 'profile', 'user'), { recursive: true });
      writeFileSync(
        join(dir, 'profile', 'user', 'registrymodifications.xcu'),
        '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          '<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>',
      );
      const out = await writeWorkbook({ bytes: await fixture(), fileName: 'A2.1.xlsx' }, a21Plan);
      writeFileSync(join(dir, 'out.xlsx'), Buffer.from(out));
      execFileSync(
        soffice!,
        [
          '--headless',
          `-env:UserInstallation=file://${dir}/profile`,
          '--convert-to',
          'csv',
          '--outdir',
          dir,
          join(dir, 'out.xlsx'),
        ],
        { stdio: 'ignore', timeout: 60_000 },
      );
      const csv = readFileSync(join(dir, 'out.csv'), 'utf8').split(/\r?\n/);
      // Row 22 of the first sheet: C22 = 3 and the hidden H22 formula recalculated to 6.
      expect(csv[21]!.split(',').slice(2, 8)).toEqual(['3', '', '', '', '', '6']);
      expect(csv[3]).toContain('IS-01');
    },
    90_000,
  );
});
