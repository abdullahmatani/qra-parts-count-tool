// Generates synthetic drawings for tests (e2e/fixtures). They imitate PEFS/P&ID
// sheets: vector line work, valve symbols, instrument bubbles, text and a title
// block with drawing number, title and revision. Run: node scripts/generate-fixtures.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const OUT = new URL('../e2e/fixtures/', import.meta.url);
const A1 = [2384, 1684];
const A3 = [1191, 842];

/** Deterministic pseudo-random numbers so fixtures are reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function titleBlock(page, font, bold, { drawingNo, title, rev, sheet }) {
  const { width } = page.getSize();
  const x = width - 620;
  const y = 30;
  page.drawRectangle({ x, y, width: 590, height: 130, borderColor: rgb(0, 0, 0), borderWidth: 2 });
  page.drawLine({ start: { x, y: y + 90 }, end: { x: x + 590, y: y + 90 }, thickness: 1 });
  page.drawLine({ start: { x: x + 420, y }, end: { x: x + 420, y: y + 90 }, thickness: 1 });
  page.drawText('TITLE', { x: x + 8, y: y + 115, size: 9, font });
  page.drawText(title, { x: x + 8, y: y + 98, size: 14, font: bold });
  page.drawText('DRAWING NO.', { x: x + 8, y: y + 72, size: 9, font });
  page.drawText(drawingNo, { x: x + 8, y: y + 45, size: 22, font: bold });
  page.drawText('SHEET', { x: x + 8, y: y + 20, size: 9, font });
  page.drawText(sheet, { x: x + 60, y: y + 12, size: 12, font: bold });
  page.drawText('REV', { x: x + 430, y: y + 72, size: 9, font });
  page.drawText(rev, { x: x + 470, y: y + 40, size: 26, font: bold });
}

function valve(page, cx, cy, size = 14) {
  const h = size / 2;
  page.drawSvgPath(
    `M ${-size} ${-h} L ${-size} ${h} L 0 0 Z M ${size} ${-h} L ${size} ${h} L 0 0 Z`,
    {
      x: cx,
      y: cy,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.2,
    },
  );
}

function instrument(page, font, cx, cy, tag) {
  page.drawCircle({ x: cx, y: cy, size: 16, borderColor: rgb(0, 0, 0), borderWidth: 1.2 });
  page.drawLine({ start: { x: cx - 16, y: cy }, end: { x: cx + 16, y: cy }, thickness: 0.8 });
  const [a, b] = tag.split('-');
  page.drawText(a, { x: cx - 8, y: cy + 3, size: 7, font });
  page.drawText(b, { x: cx - 9, y: cy - 10, size: 7, font });
}

/** A dense P&ID-like sheet: `lines` process lines with valves, flanges and instruments. */
function drawSheet(page, font, bold, meta, { lines = 60, seed = 1 } = {}) {
  const random = rng(seed);
  const { width, height } = page.getSize();
  page.drawRectangle({
    x: 20,
    y: 20,
    width: width - 40,
    height: height - 40,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.5,
  });
  const margin = 80;
  for (let i = 0; i < lines; i += 1) {
    const y = margin + 200 + ((height - 2 * margin - 260) * i) / lines;
    const x0 = margin + random() * 200;
    const x1 = width - margin - random() * 400;
    page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 1.4 });
    page.drawText(`${4 + Math.floor(random() * 8)}"-P-${1000 + i}-A1`, {
      x: x0 + 20,
      y: y + 4,
      size: 7,
      font,
    });
    const symbols = 3 + Math.floor(random() * 6);
    for (let s = 0; s < symbols; s += 1) {
      const cx = x0 + ((x1 - x0) * (s + 1)) / (symbols + 1);
      const kind = random();
      if (kind < 0.5) {
        valve(page, cx, y);
        page.drawText(`HV-${1000 + i * 10 + s}`, { x: cx - 16, y: y - 20, size: 6.5, font });
      } else if (kind < 0.8) {
        page.drawLine({
          start: { x: cx - 2, y: y - 8 },
          end: { x: cx - 2, y: y + 8 },
          thickness: 1.2,
        });
        page.drawLine({
          start: { x: cx + 2, y: y - 8 },
          end: { x: cx + 2, y: y + 8 },
          thickness: 1.2,
        });
      } else {
        page.drawLine({ start: { x: cx, y }, end: { x: cx, y: y + 30 }, thickness: 0.8 });
        instrument(page, font, cx, y + 46, `PT-${100 + i}`);
      }
    }
  }
  // Off-page connector with a continuation drawing number (LNK-06 test data).
  page.drawSvgPath('M 0 0 L 70 0 L 85 -12 L 70 -24 L 0 -24 Z', {
    x: width - 180,
    y: height - 120,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.2,
  });
  page.drawText(meta.continuation ?? 'PEFS-1002', {
    x: width - 176,
    y: height - 138,
    size: 8,
    font: bold,
  });
  titleBlock(page, font, bold, meta);
}

async function pdf(pages) {
  const doc = await PDFDocument.create();
  doc.setTitle('QRA Parts Count test drawing');
  doc.setCreator('qra-parts-count-tool fixtures');
  doc.setProducer('pdf-lib');
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const spec of pages) {
    const page = doc.addPage(spec.size);
    drawSheet(page, font, bold, spec.meta, spec.options);
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
  }
  return doc.save({ useObjectStreams: false });
}

await mkdir(OUT, { recursive: true });
const files = {
  'PEFS-1001_A1.pdf': await pdf([
    {
      size: A1,
      meta: { drawingNo: 'PEFS-1001', title: 'INLET SEPARATOR V-100', rev: 'C', sheet: '1 OF 1' },
      options: { lines: 90, seed: 11 },
    },
  ]),
  'PEFS-2000_multipage.pdf': await pdf(
    [1, 2, 3].map((n) => ({
      size: A3,
      meta: {
        drawingNo: `PEFS-200${n}`,
        title: `COMPRESSION TRAIN STAGE ${n}`,
        rev: 'B',
        sheet: `${n} OF 3`,
        continuation: `PEFS-200${n === 3 ? 1 : n + 1}`,
      },
      options: { lines: 25, seed: 20 + n },
    })),
  ),
  'PEFS-3001_rotated.pdf': await pdf([
    {
      size: A3,
      rotate: 90,
      meta: { drawingNo: 'PEFS-3001', title: 'FLARE KO DRUM', rev: '0', sheet: '1 OF 1' },
      options: { lines: 20, seed: 31 },
    },
  ]),
};
for (const [name, bytes] of Object.entries(files)) {
  await writeFile(new URL(name, OUT), bytes);
  console.log(`wrote e2e/fixtures/${name} (${(bytes.length / 1024).toFixed(0)} kB)`);
}
