// @vitest-environment node
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import type * as PdfjsModule from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import type { TextRun } from '@/features/cad/display-list';
import { PdfPageSource } from '@/features/viewer/pdf/pdf-source';
import { cadRunBox } from './drawing-text';

type Pdfjs = typeof PdfjsModule;

async function boxesOf(rotation: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([842, 595]);
  page.setRotation(degrees(rotation));
  page.drawText('HV-1001', { x: 100, y: 500, size: 12, font });
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
  const task = pdfjs.getDocument({ data: await doc.save(), disableFontFace: true, verbosity: 0 });
  const pdf = await task.promise;
  const source = new PdfPageSource(await pdf.getPage(1), () => {});
  const boxes = await source.textBoxes();
  await task.destroy();
  return { boxes, width: font.widthOfTextAtSize('HV-1001', 12) };
}

describe('drawing text boxes (DRW-08)', () => {
  it('maps PDF text runs into drawing coordinates', async () => {
    const { boxes, width } = await boxesOf(0);
    expect(boxes).toHaveLength(1);
    const [box] = boxes;
    expect(box!.text).toBe('HV-1001');
    expect(box!.x).toBeCloseTo(100, 1);
    // PDF.js measures with its own glyph widths: within a couple of points.
    expect(Math.abs(box!.width - width)).toBeLessThan(2);
    // Baseline at 595 - 500 = 95 in the y-down drawing frame; the box sits above it.
    expect(box!.y + box!.height).toBeCloseTo(95, 0);
    expect(box!.height).toBeGreaterThan(8);
  });

  it('follows the page rotation', async () => {
    const { boxes, width } = await boxesOf(90);
    const [box] = boxes;
    // /Rotate 90: PDF x runs down the displayed page and PDF y runs across it,
    // so the run is a tall box starting at the baseline (y = 500 → x = 500).
    expect(box!.x).toBeCloseTo(500, 1);
    expect(box!.width).toBeGreaterThan(8);
    expect(box!.y).toBeCloseTo(100, 1);
    expect(Math.abs(box!.height - width)).toBeLessThan(2);
  });

  it('boxes CAD text by its alignment and rotation', () => {
    const run: TextRun = {
      text: 'P-101',
      x: 50,
      y: 80,
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      size: 10,
      align: 'center',
      baseline: 'middle',
      color: 0,
    };
    const box = cadRunBox(run);
    expect(box.x + box.width / 2).toBeCloseTo(50, 6);
    expect(box.y + box.height / 2).toBeCloseTo(80, 6);
    // Text running up the sheet (rotated 90°): the box is tall and narrow.
    const vertical = cadRunBox({ ...run, a: 0, b: -1, c: 1, d: 0, align: 'left' });
    expect(vertical.height).toBeGreaterThan(vertical.width);
  });
});
