/**
 * Draws the sample PEFS (two A3 sheets in one PDF) from the sample layout with
 * pdf-lib: line work, symbols, tags, off-page connectors and a title block.
 * Paths are written in drawing coordinates (y down) through SVG paths, which
 * pdf-lib draws from the page's top-left corner.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  SAMPLE_SHEETS,
  SHEET,
  connectorBox,
  type SampleSheet,
  type SampleSymbol,
} from './sample-layout';

const BLACK = rgb(0, 0, 0);
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

interface Pen {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

function path(pen: Pen, d: string, options: { fill?: boolean; width?: number } = {}): void {
  pen.page.drawSvgPath(d, {
    x: 0,
    y: SHEET.height,
    borderColor: BLACK,
    borderWidth: options.width ?? 1.2,
    ...(options.fill ? { color: BLACK } : {}),
  });
}

function text(pen: Pen, value: string, x: number, y: number, size = 7, bold = false): void {
  pen.page.drawText(value, {
    x,
    y: SHEET.height - y,
    size,
    font: bold ? pen.bold : pen.font,
    color: BLACK,
  });
}

function centred(pen: Pen, value: string, x: number, y: number, size = 7, bold = false): void {
  const width = (bold ? pen.bold : pen.font).widthOfTextAtSize(value, size);
  text(pen, value, x - width / 2, y, size, bold);
}

const bowtie = (x: number, y: number) =>
  `M ${x - 14} ${y - 7} L ${x - 14} ${y + 7} L ${x} ${y} Z M ${x + 14} ${y - 7} L ${x + 14} ${y + 7} L ${x} ${y} Z`;

function circle(x: number, y: number, r: number): string {
  return `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} Z`;
}

function drawSymbol(pen: Pen, s: SampleSymbol): void {
  const { x, y } = s;
  switch (s.kind) {
    case 'valve':
      path(pen, bowtie(x, y));
      if (s.tagBeside) text(pen, s.tag, x + 20, y + 3);
      else centred(pen, s.tag, x, y + 22);
      break;
    case 'check':
      path(pen, bowtie(x, y));
      path(pen, `M ${x + 14} ${y - 9} L ${x + 14} ${y + 9}`, { width: 2 });
      centred(pen, s.tag, x, y + 22);
      break;
    case 'esdv':
      path(pen, bowtie(x, y));
      path(
        pen,
        `M ${x} ${y} L ${x} ${y - 20} M ${x - 11} ${y - 20} L ${x + 11} ${y - 20} L ${x + 11} ${y - 32} L ${x - 11} ${y - 32} Z`,
      );
      centred(pen, 'ESD', x, y - 23, 6);
      centred(pen, s.tag, x, y - 38, 7, true);
      break;
    case 'flange':
      path(pen, `M ${x - 3} ${y - 9} L ${x - 3} ${y + 9} M ${x + 3} ${y - 9} L ${x + 3} ${y + 9}`, {
        width: 1.6,
      });
      break;
    case 'instrument': {
      path(pen, circle(x, y, 16));
      path(pen, `M ${x - 16} ${y} L ${x + 16} ${y}`, { width: 0.8 });
      const [a = '', b = ''] = s.tag.split('-');
      centred(pen, a, x, y - 4, 7);
      centred(pen, b, x, y + 10, 7);
      break;
    }
    case 'vessel':
      path(pen, 'M 530 240 L 700 240 A 60 60 0 0 1 700 360 L 530 360 A 60 60 0 0 1 530 240 Z', {
        width: 1.6,
      });
      centred(pen, s.tag, x, y - 4, 10, true);
      centred(pen, 'INLET SEPARATOR', x, y + 12, 7);
      break;
    case 'pump':
      path(pen, circle(x, y, 22));
      path(
        pen,
        `M ${x} ${y - 22} L ${x + 22} ${y - 22} M ${x - 16} ${y + 16} L ${x - 22} ${y + 30} L ${x + 22} ${y + 30} L ${x + 16} ${y + 16}`,
      );
      centred(pen, s.tag, x, y + 44, 8, true);
      break;
    case 'filter':
      path(
        pen,
        `M ${x - 20} ${y - 28} L ${x + 20} ${y - 28} L ${x + 20} ${y + 28} L ${x - 20} ${y + 28} Z M ${x - 20} ${y - 28} L ${x + 20} ${y + 28}`,
      );
      centred(pen, s.tag, x, y + 42, 8, true);
      break;
    case 'compressor':
      path(
        pen,
        `M ${x - 60} ${y - 20} L ${x + 60} ${y - 45} L ${x + 60} ${y + 45} L ${x - 60} ${y + 20} Z`,
        {
          width: 1.6,
        },
      );
      centred(pen, s.tag, x, y + 4, 10, true);
      centred(pen, 'SUCTION', x - 50, y - 26, 6);
      break;
  }
}

function drawSheet(pen: Pen, sheet: SampleSheet): void {
  const { width: w, height: h } = SHEET;
  path(pen, `M 20 20 L ${w - 20} 20 L ${w - 20} ${h - 20} L 20 ${h - 20} Z`, { width: 2 });

  for (const line of sheet.lines) {
    const d = line.points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
    path(pen, d, { width: 1.4 });
    if (line.label) text(pen, line.label.text, line.label.x, line.label.y, 6.5);
  }
  for (const symbol of sheet.symbols) drawSymbol(pen, symbol);
  for (const connector of sheet.connectors) {
    const b = connectorBox(connector);
    const tip = connector.side === 'right' ? b.x + b.w : b.x;
    const back = connector.side === 'right' ? b.x + b.w - 14 : b.x + 14;
    const flat = connector.side === 'right' ? b.x : b.x + b.w;
    path(
      pen,
      `M ${flat} ${b.y} L ${back} ${b.y} L ${tip} ${connector.y} L ${back} ${b.y + b.h} L ${flat} ${b.y + b.h} Z`,
    );
    centred(pen, connector.text, b.x + b.w / 2, connector.y + 3, 7, true);
  }
  for (const note of sheet.notes) text(pen, note.text, note.x, note.y, 6.5);

  // Title block, bottom right.
  const x = w - 380;
  const y = h - 140;
  path(pen, `M ${x} ${y} L ${w - 20} ${y} L ${w - 20} ${h - 20} L ${x} ${h - 20} Z`, {
    width: 1.6,
  });
  path(
    pen,
    `M ${x} ${y + 40} L ${w - 20} ${y + 40} M ${w - 110} ${y + 40} L ${w - 110} ${h - 20}`,
    {
      width: 1,
    },
  );
  text(pen, 'TITLE', x + 8, y + 12, 6);
  text(pen, sheet.title, x + 8, y + 30, 11, true);
  text(pen, 'DRAWING NO.', x + 8, y + 52, 6);
  text(pen, sheet.drawingNo, x + 8, y + 78, 18, true);
  text(pen, 'SHEET', x + 8, y + 98, 6);
  text(pen, `${sheet.sheet} OF 1`, x + 50, y + 98, 8, true);
  text(pen, 'REV', w - 100, y + 52, 6);
  text(pen, sheet.revision, w - 75, y + 84, 22, true);
  text(pen, 'SAMPLE STUDY - FOR TRAINING ONLY', x + 8, y + 114, 6);
}

/** The sample PEFS as PDF bytes; the same bytes every time. */
export async function drawSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('QRA Parts Count Tool sample PEFS');
  doc.setProducer('QRA Parts Count Tool');
  doc.setCreator('QRA Parts Count Tool');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const sheet of SAMPLE_SHEETS) {
    const page = doc.addPage([SHEET.width, SHEET.height]);
    drawSheet({ page, font, bold }, sheet);
  }
  return doc.save({ useObjectStreams: true });
}
