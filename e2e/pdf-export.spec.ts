/**
 * Pre-export check and annotated PDF export (roadmap #40–43): the check lists
 * what may be wrong and shows it on the drawing; the export writes one PDF per
 * drawing (PDF pages kept as vectors with their rotation, DXF layouts drawn at
 * paper size), a combined PDF per segment, pattern-based names and a log of
 * the warnings the user exported past (EXP-01, EXP-03..05, NFR-07, LNK-04).
 */
import { PDFDocument } from 'pdf-lib';
import type * as PdfjsModule from 'pdfjs-dist';
import { expect, test } from './fixtures';
import { fixture, openSeeded, seedProject } from './seed';

type Pdfjs = typeof PdfjsModule;

async function pageText(bytes: Uint8Array, pageNumber = 1): Promise<string[]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    return content.items.map((item) => ('str' in item ? item.str : ''));
  } finally {
    await task.destroy();
  }
}

const circle = (cx: number, cy: number) => ({ type: 'circle', cx, cy, r: 14 });

test('checks the project and exports annotated PDFs (EXP-01, EXP-03..05)', async ({ app }) => {
  const dir = `pdf-export-${test.info().project.name}`;
  await app.open();
  await seedProject(
    app,
    dir,
    [
      {
        file: 'PEFS-1001_A1.pdf',
        drawingNo: 'PEFS-1001',
        revision: 'B',
        width: 2384,
        height: 1684,
      },
      { file: 'PEFS-3001_rotated.pdf', drawingNo: 'PEFS-3001', width: 842, height: 1191 },
      {
        file: 'PEFS-4001.dxf',
        fileType: 'dxf',
        layout: 'Model',
        drawingNo: 'PEFS-4001',
        width: 2480,
        height: 1754,
      },
    ],
    {
      name: 'Plant A',
      countRevision: 'C',
      segments: [
        {
          id: 'seg_1',
          label: 'IS-01',
          colour: 1,
          fluid: 'Gas',
          drawingIds: ['drw_seed0', 'drw_seed2'],
        },
        // No drawings and no items: two pre-export warnings.
        { id: 'seg_2', label: 'IS-02', colour: 2 },
      ],
      markers: [
        {
          id: 'mkr_1',
          drawingId: 'drw_seed0',
          segmentId: 'seg_1',
          shape: 'circle',
          geometry: circle(600, 500),
        },
        { id: 'mkr_2', drawingId: 'drw_seed1', shape: 'circle', geometry: circle(300, 400) },
        {
          id: 'mkr_3',
          drawingId: 'drw_seed2',
          segmentId: 'seg_1',
          shape: 'circle',
          geometry: circle(800, 700),
        },
      ],
      items: [
        {
          id: 'itm_1',
          seq: 1,
          markerId: 'mkr_1',
          drawingId: 'drw_seed0',
          segmentId: 'seg_1',
          tag: 'HV-7',
        },
        { id: 'itm_2', seq: 2, markerId: 'mkr_2', drawingId: 'drw_seed1', segmentId: null },
        {
          id: 'itm_3',
          seq: 3,
          markerId: 'mkr_3',
          drawingId: 'drw_seed2',
          segmentId: 'seg_1',
          tag: 'PSV-3',
        },
      ],
      links: [
        {
          id: 'lnk_1',
          sourceDrawingId: 'drw_seed0',
          rect: { x: 100, y: 100, width: 200, height: 100 },
          targetDrawingId: 'drw_seed1',
          label: 'LINK-NOT-EXPORTED',
        },
      ],
      nextItemSeq: 4,
    },
  );
  await openSeeded(app, dir);
  const page = app.page;

  // EXP-01: the check lists the problems and can show them on the drawing.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  const issues = dialog.getByTestId('check-issue');
  await expect
    .poll(() => issues.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind'))))
    .toEqual(['unassignedMarkers', 'incompleteItems', 'emptySegments', 'segmentsWithoutDrawings']);
  await expect(dialog.locator('[data-kind="emptySegments"]')).toContainText('IS-02');
  await dialog.getByRole('button', { name: 'Show: 1 marker is not in a segment' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tab', { name: 'PEFS-3001' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-marker-id="mkr_2"]')).toHaveAttribute(
    'data-highlighted',
    'true',
  );

  // Outputs: PDFs only, a custom name pattern (EXP-05) and the segment PDFs.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await dialog.getByLabel('Excel workbook').uncheck();
  await dialog.getByLabel('Combined PDF per segment').check();
  const pattern = dialog.getByLabel('PDF file names');
  await pattern.fill('{project}_{drawingNo}_{rev}');
  await pattern.press('Enter');
  await expect(dialog.getByTestId('filename-example')).toHaveText('e.g. Plant A_PEFS-1001_B.pdf');
  await dialog.getByRole('button', { name: 'Export anyway' }).click();
  const result = dialog.getByTestId('export-result');
  await expect(result).toContainText('IS-01_drawings.pdf', { timeout: 60_000 });
  await expect(dialog.getByTestId('export-failures')).toHaveCount(0);

  const folders = (await app.list(dir, 'exports')).filter((name) => name !== '.keep');
  expect(folders).toHaveLength(1);
  const folder = `exports/${folders[0]}`;
  expect((await app.list(dir, folder)).sort()).toEqual([
    'IS-01_drawings.pdf',
    'Plant A_PEFS-1001_B.pdf',
    'Plant A_PEFS-3001_A.pdf',
    'Plant A_PEFS-4001_A.pdf',
    'export_log.json',
  ]);
  const read = async (name: string) => app.readBytes(dir, `${folder}/${name}`);

  // PDF drawing: same sheet, original content kept, markers, legend and stamp added.
  const a1Bytes = await read('Plant A_PEFS-1001_B.pdf');
  const a1 = await PDFDocument.load(a1Bytes);
  expect(a1.getPageCount()).toBe(1);
  expect(a1.getPage(0).getSize()).toEqual({ width: 2384, height: 1684 });
  const a1Text = await pageText(a1Bytes);
  expect(a1Text).toEqual(
    expect.arrayContaining([
      'HV-7',
      'IS-01 – Gas',
      'Plant A',
      'PEFS-1001 rev B',
      'Count revision C',
    ]),
  );
  expect(a1Text.join(' ')).toContain('PEFS-1001'); // the drawing's own title block
  expect(a1Text.join(' ')).not.toContain('LINK-NOT-EXPORTED'); // LNK-04

  // Rotated PDF: the page keeps its /Rotate; the flagged marker is in the legend.
  const rotatedBytes = await read('Plant A_PEFS-3001_A.pdf');
  const rotated = await PDFDocument.load(rotatedBytes);
  const source = await PDFDocument.load(fixture('PEFS-3001_rotated.pdf'));
  expect(rotated.getPage(0).getRotation()).toEqual(source.getPage(0).getRotation());
  expect(await pageText(rotatedBytes)).toEqual(
    expect.arrayContaining(['#2', 'Not in a segment', 'Needs attention']),
  );

  // DXF layout: vector page at the drawing's paper size (EXP-04).
  const cadBytes = await read('Plant A_PEFS-4001_A.pdf');
  const cad = await PDFDocument.load(cadBytes);
  const { width, height } = cad.getPage(0).getSize();
  expect(width).toBeGreaterThan(2384);
  expect(width).toBeLessThan(2600);
  expect(height).toBeGreaterThan(1684);
  expect(await pageText(cadBytes)).toEqual(
    expect.arrayContaining(['PSV-3', 'GAS COMPRESSOR SUCTION DRUM']),
  );

  // Segment PDF: the segment's drawings, one page each, with its markers only.
  const segmentBytes = await read('IS-01_drawings.pdf');
  expect((await PDFDocument.load(segmentBytes)).getPageCount()).toBe(2);
  expect(await pageText(segmentBytes, 1)).toEqual(
    expect.arrayContaining(['HV-7', 'Segment IS-01']),
  );

  // The log names the outputs and the warnings exported past.
  const log = JSON.parse(await app.readText(dir, `${folder}/export_log.json`)) as {
    outputs: string[];
    pdf: { drawings: number; segments: number; filenamePattern: string };
    acceptedWarnings: { kind: string; count: number }[];
    failures: unknown[];
    project: { countRevision: string };
  };
  expect(log.pdf).toMatchObject({
    drawings: 3,
    segments: 1,
    filenamePattern: '{project}_{drawingNo}_{rev}',
  });
  expect(log.acceptedWarnings.map((w) => w.kind)).toEqual([
    'unassignedMarkers',
    'incompleteItems',
    'emptySegments',
    'segmentsWithoutDrawings',
  ]);
  expect(log.failures).toEqual([]);
  expect(log.project.countRevision).toBe('C');

  // The drawings themselves are untouched (NFR-07).
  expect(await app.readBytes(dir, 'drawings/PEFS-1001_A1.pdf')).toEqual(
    new Uint8Array(fixture('PEFS-1001_A1.pdf')),
  );
  await app.removeDirectory(dir);
});
