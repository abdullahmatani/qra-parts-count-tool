// Heavy A1 drawings for the performance tests (roadmap #15, NFR-02, NFR-03).
// Generated on demand into .cache/perf/ (not committed: they are several MB).
//   node scripts/perf-fixtures.mjs
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const PERF_DIR = new URL('../.cache/perf/', import.meta.url);
export const HEAVY_PDF = 'PEFS-A1-heavy.pdf';
export const HEAVY_DXF = 'PEFS-A1-heavy.dxf';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * An A1 sheet (2384 × 1684 pt) dense like a busy P&ID: `rows` process lines,
 * each with valves, flanges, reducers and instrument bubbles, tag text on every
 * symbol, line numbers, a grid of equipment outlines and a title block.
 */
export async function heavyPdf({ rows = 240, symbolsPerRow = 40, seed = 7 } = {}) {
  const random = rng(seed);
  const doc = await PDFDocument.create();
  doc.setProducer('pdf-lib');
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([2384, 1684]);
  const black = rgb(0, 0, 0);
  page.drawRectangle({
    x: 20,
    y: 20,
    width: 2344,
    height: 1644,
    borderColor: black,
    borderWidth: 2,
  });
  let symbols = 0;
  for (let r = 0; r < rows; r += 1) {
    const y = 180 + (r * 1400) / rows;
    const x0 = 60 + random() * 80;
    const x1 = 2280 - random() * 120;
    page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.9, color: black });
    page.drawText(`${2 + (r % 10)}"-P-${10000 + r}-B1A`, {
      x: x0 + 4,
      y: y + 2.5,
      size: 3.2,
      font,
    });
    for (let k = 0; k < symbolsPerRow; k += 1) {
      const x = x0 + ((x1 - x0) * (k + 0.5)) / symbolsPerRow;
      const kind = random();
      if (kind < 0.45) {
        page.drawSvgPath('M -5 -2.5 L -5 2.5 L 0 0 Z M 5 -2.5 L 5 2.5 L 0 0 Z', {
          x,
          y,
          borderColor: black,
          borderWidth: 0.6,
        });
        page.drawText(`HV-${r * 100 + k}`, { x: x - 7, y: y - 8, size: 2.8, font });
      } else if (kind < 0.75) {
        page.drawLine({
          start: { x: x - 1, y: y - 4 },
          end: { x: x - 1, y: y + 4 },
          thickness: 0.6,
        });
        page.drawLine({
          start: { x: x + 1, y: y - 4 },
          end: { x: x + 1, y: y + 4 },
          thickness: 0.6,
        });
      } else {
        page.drawLine({ start: { x, y }, end: { x, y: y + 5 }, thickness: 0.4 });
        page.drawCircle({ x, y: y + 9, size: 4, borderColor: black, borderWidth: 0.5 });
        page.drawText(`PT`, { x: x - 2.5, y: y + 9.5, size: 2.2, font });
        page.drawText(`${r}${k}`, { x: x - 2.5, y: y + 6.3, size: 2.2, font });
      }
      symbols += 1;
    }
  }
  const tb = { x: 1764, y: 30 };
  page.drawRectangle({ ...tb, width: 590, height: 130, borderColor: black, borderWidth: 2 });
  page.drawText('DRAWING NO.', { x: tb.x + 8, y: tb.y + 72, size: 9, font });
  page.drawText('PEFS-9999', { x: tb.x + 8, y: tb.y + 45, size: 22, font: bold });
  page.drawText('REV', { x: tb.x + 430, y: tb.y + 72, size: 9, font });
  page.drawText('D', { x: tb.x + 470, y: tb.y + 40, size: 26, font: bold });
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, symbols };
}

/** The same density as a DXF drawing in millimetres (A1 = 841 × 594 mm). */
export function heavyDxf({ rows = 240, symbolsPerRow = 40, seed = 7 } = {}) {
  const random = rng(seed);
  const out = [];
  const p = (...items) => {
    for (let i = 0; i < items.length; i += 2) out.push(String(items[i]), String(items[i + 1]));
  };
  const s = 25.4 / 72; // points → mm, so the sheet matches the PDF
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER');
  for (const [name, color] of [
    ['0', 7],
    ['PIPE', 1],
    ['TEXT', 7],
    ['SYM', 3],
  ]) {
    p(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
  }
  p(0, 'ENDTAB', 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'BLOCKS');
  p(0, 'BLOCK', 8, '0', 2, 'VALVE', 70, 0, 10, 0, 20, 0);
  p(
    0,
    'LWPOLYLINE',
    8,
    '0',
    90,
    4,
    70,
    1,
    10,
    -5 * s,
    20,
    -2.5 * s,
    10,
    -5 * s,
    20,
    2.5 * s,
    10,
    5 * s,
    20,
    -2.5 * s,
    10,
    5 * s,
    20,
    2.5 * s,
  );
  p(0, 'ENDBLK', 8, '0');
  p(0, 'BLOCK', 8, '0', 2, 'FLANGE', 70, 0, 10, 0, 20, 0);
  p(0, 'LINE', 8, '0', 10, -s, 20, -4 * s, 11, -s, 21, 4 * s);
  p(0, 'LINE', 8, '0', 10, s, 20, -4 * s, 11, s, 21, 4 * s);
  p(0, 'ENDBLK', 8, '0');
  p(0, 'BLOCK', 8, '0', 2, 'INSTR', 70, 0, 10, 0, 20, 0);
  p(0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 0, 21, 5 * s);
  p(0, 'CIRCLE', 8, '0', 10, 0, 20, 9 * s, 40, 4 * s);
  p(0, 'ENDBLK', 8, '0');
  p(0, 'ENDSEC');
  p(0, 'SECTION', 2, 'ENTITIES');
  p(
    0,
    'LWPOLYLINE',
    8,
    'PIPE',
    90,
    4,
    70,
    1,
    10,
    20 * s,
    20,
    20 * s,
    10,
    2364 * s,
    20,
    20 * s,
    10,
    2364 * s,
    20,
    1664 * s,
    10,
    20 * s,
    20,
    1664 * s,
  );
  let symbols = 0;
  for (let r = 0; r < rows; r += 1) {
    const y = (180 + (r * 1400) / rows) * s;
    const x0 = (60 + random() * 80) * s;
    const x1 = (2280 - random() * 120) * s;
    p(0, 'LINE', 8, 'PIPE', 10, x0, 20, y, 11, x1, 21, y);
    p(
      0,
      'TEXT',
      8,
      'TEXT',
      10,
      x0 + 4 * s,
      20,
      y + 2.5 * s,
      40,
      2.3 * s,
      1,
      `${2 + (r % 10)}"-P-${10000 + r}-B1A`,
    );
    for (let k = 0; k < symbolsPerRow; k += 1) {
      const x = x0 + ((x1 - x0) * (k + 0.5)) / symbolsPerRow;
      const kind = random();
      const block = kind < 0.45 ? 'VALVE' : kind < 0.75 ? 'FLANGE' : 'INSTR';
      p(0, 'INSERT', 8, 'SYM', 2, block, 10, x, 20, y, 41, 1, 42, 1, 50, 0);
      if (block !== 'FLANGE') {
        p(
          0,
          'TEXT',
          8,
          'TEXT',
          10,
          x - 7 * s,
          20,
          y - 8 * s,
          40,
          2 * s,
          1,
          `${block === 'VALVE' ? 'HV' : 'PT'}-${r * 100 + k}`,
        );
      }
      symbols += 1;
    }
  }
  p(0, 'TEXT', 8, 'TEXT', 10, 1772 * s, 20, 102 * s, 40, 6.5 * s, 1, 'DRAWING NO.');
  p(0, 'TEXT', 8, 'TEXT', 10, 1772 * s, 20, 75 * s, 40, 16 * s, 1, 'PEFS-9998');
  p(0, 'ENDSEC', 0, 'EOF');
  return { text: `${out.join('\n')}\n`, symbols };
}

async function exists(url) {
  try {
    await stat(url);
    return true;
  } catch {
    return false;
  }
}

/** Writes the heavy fixtures if missing; returns their file URLs. */
export async function ensurePerfFixtures() {
  await mkdir(PERF_DIR, { recursive: true });
  const pdfUrl = new URL(HEAVY_PDF, PERF_DIR);
  const dxfUrl = new URL(HEAVY_DXF, PERF_DIR);
  if (!(await exists(pdfUrl))) await writeFile(pdfUrl, (await heavyPdf()).bytes);
  if (!(await exists(dxfUrl))) await writeFile(dxfUrl, heavyDxf().text);
  return { pdf: pdfUrl, dxf: dxfUrl };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pdf, dxf } = await ensurePerfFixtures();
  for (const url of [pdf, dxf]) {
    console.log(`${url.pathname} ${((await stat(url)).size / 1024 / 1024).toFixed(1)} MB`);
  }
}
