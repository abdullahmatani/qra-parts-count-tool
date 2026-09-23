// @vitest-environment node
/**
 * Annotated PDF pages (EXP-03, EXP-04, NFR-07). The output is read back with
 * PDF.js, the library the viewer uses, so a label is checked to land where the
 * marker was placed on screen, whatever the page's crop box and /Rotate.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { PDFDocument, degrees, pushGraphicsState, concatTransformationMatrix } from 'pdf-lib';
import type * as PdfjsModule from 'pdfjs-dist';
import type { DisplayList } from '@/features/cad/display-list';
import {
  addAnnotatedPdfPage,
  addCadPage,
  embedFonts,
  invert,
  labelAnchor,
  sheetScale,
  viewportTransform,
  type Matrix,
} from './pdf-annotate';
import type { Overlay } from '@/domain/export/pdf-plan';

type Pdfjs = typeof PdfjsModule;
const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
const opened: { destroy: () => Promise<void> }[] = [];
afterAll(async () => {
  await Promise.all(opened.map((task) => task.destroy()));
});

async function readBack(bytes: Uint8Array) {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // Text positions only; glyph outlines are not needed.
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  opened.push(task);
  return task.promise;
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const overlay = (label: string, x: number, y: number): Overlay => ({
  markers: [
    {
      geometry: { type: 'circle', cx: x, cy: y, r: 10 },
      colour: '#dc2626',
      dash: [],
      label,
      esdv: false,
      warning: false,
    },
    {
      geometry: { type: 'rect', x: x - 40, y: y + 30, width: 80, height: 40 },
      colour: '#2563eb',
      dash: [],
      label: 'ESDV-1',
      esdv: true,
      warning: true,
    },
  ],
  legendTitle: 'Segments',
  legend: [
    { label: 'IS-01 Gas', colour: '#dc2626', dash: [], kind: 'circle' },
    { label: 'ESDV', colour: '#2563eb', dash: [], kind: 'esdv' },
  ],
  stamp: ['Plant A QRA', 'PEFS-1001 rev B', 'Count rev 0', '2026-09-23'],
});

/** A source PDF with pages that stress the coordinate mapping. */
async function sourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const plain = doc.addPage([842, 595]);
  plain.drawText('Original A', { x: 50, y: 500, size: 12 });

  const rotated = doc.addPage([595, 842]);
  rotated.setRotation(degrees(90));
  rotated.setCropBox(20, 30, 500, 780);
  rotated.drawText('Original B', { x: 100, y: 400, size: 12 });

  // Content that leaves a scaled CTM behind (no q/Q), as some CAD plotters do.
  const unbalanced = doc.addPage([842, 595]);
  unbalanced.setRotation(degrees(270));
  unbalanced.pushOperators(pushGraphicsState(), concatTransformationMatrix(2, 0, 0, 2, 0, 0));
  unbalanced.drawText('Original C', { x: 20, y: 20, size: 12 });
  return doc.save();
}

describe('viewportTransform', () => {
  it('matches PDF.js for every rotation and an offset crop box', async () => {
    const pdf = await readBack(await sourcePdf());
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      for (const extra of [0, 90, 180, 270]) {
        const rotation = (page.rotate + extra) % 360;
        const expected = page.getViewport({ scale: 1, rotation }).transform;
        const actual = viewportTransform(page.view, rotation);
        actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
      }
    }
  });

  it('inverts', () => {
    const m = viewportTransform([20, 30, 500, 780], 90);
    const [x, y] = apply(invert(m), ...apply(m, 123, 456));
    expect(x).toBeCloseTo(123, 9);
    expect(y).toBeCloseTo(456, 9);
  });
});

describe('addAnnotatedPdfPage', () => {
  it('keeps each page and draws labels, legend and stamp where the viewer showed them', async () => {
    const source = await PDFDocument.load(await sourcePdf());
    const out = await PDFDocument.create();
    const fonts = await embedFonts(out);
    for (let i = 0; i < source.getPageCount(); i += 1) {
      await addAnnotatedPdfPage(out, source, i, fonts, overlay('HV-101', 200, 150));
    }
    const bytes = await out.save();

    // The pages keep their size, crop box and rotation (NFR-07).
    const saved = await PDFDocument.load(bytes);
    expect(saved.getPageCount()).toBe(3);
    expect(saved.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 270]);
    expect(saved.getPage(1).getCropBox()).toEqual({ x: 20, y: 30, width: 500, height: 780 });

    const pdf = await readBack(bytes);
    for (let n = 1; n <= 3; n += 1) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const size = { width: viewport.width, height: viewport.height };
      const content = await page.getTextContent();
      const items = content.items.filter((item) => 'str' in item) as {
        str: string;
        transform: number[];
      }[];
      const strings = items.map((item) => item.str);
      expect(strings).toContain(`Original ${'ABC'[n - 1]}`);
      expect(strings).toEqual(
        expect.arrayContaining(['HV-101', 'ESDV-1', 'Segments', 'IS-01 Gas', 'Plant A QRA']),
      );
      // Each label once: no duplicate text from a halo.
      expect(strings.filter((s) => s === 'HV-101')).toHaveLength(1);

      const label = items.find((item) => item.str === 'HV-101')!;
      const [x, y] = viewport.convertToViewportPoint(label.transform[4]!, label.transform[5]!);
      const k = sheetScale(size);
      const [ax, ay] = labelAnchor({ type: 'circle', cx: 200, cy: 150, r: 10 }, 6.5 * k, k);
      expect(x).toBeCloseTo(ax, 3);
      expect(y).toBeCloseTo(ay, 3);
      // The label reads upright on screen.
      const [ux, uy] = viewport.convertToViewportPoint(
        label.transform[4]! + label.transform[2]!,
        label.transform[5]! + label.transform[3]!,
      );
      expect(ux - x).toBeCloseTo(0, 6);
      expect(uy - y).toBeLessThan(0);

      // The stamp sits in the top-right corner of the sheet as displayed.
      const stamp = items.find((item) => item.str === 'Plant A QRA')!;
      const [sx, sy] = viewport.convertToViewportPoint(stamp.transform[4]!, stamp.transform[5]!);
      expect(sx).toBeGreaterThan(size.width / 2);
      expect(sx).toBeLessThan(size.width);
      expect(sy).toBeLessThan(size.height / 4);
    }
  });

  it('replaces characters the standard fonts cannot show', async () => {
    const source = await PDFDocument.load(await sourcePdf());
    const out = await PDFDocument.create();
    const fonts = await embedFonts(out);
    await addAnnotatedPdfPage(out, source, 0, fonts, overlay('Δp ≤ 5 → HV', 100, 100));
    const pdf = await readBack(await out.save());
    const content = await (await pdf.getPage(1)).getTextContent();
    const strings = content.items.map((item) => ('str' in item ? item.str : ''));
    expect(strings).toContain('?p ? 5 ? HV');
  });
});

describe('addCadPage', () => {
  const list: DisplayList = {
    version: 1,
    space: 'Layout1',
    width: 1190.55,
    height: 841.89,
    groups: [
      {
        clip: [10, 10, 1180, 10, 1180, 830, 10, 830],
        fills: [
          {
            color: 0xff0000,
            alpha: 0.5,
            shapes: [
              [
                [100, 100, 200, 100, 200, 200, 100, 200],
                [120, 120, 180, 120, 180, 180, 120, 180],
              ],
            ],
          },
        ],
        strokes: [
          { color: 0xffffff, width: 0.7, dash: null, paths: [[0, 0, 500, 300, 600, 300]] },
          { color: 0x00ff00, width: 0.35, dash: [4, 2], paths: [[300, 300, 400, 400]] },
        ],
        texts: [
          {
            text: 'P-101',
            x: 400,
            y: 500,
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            size: 10,
            align: 'left',
            baseline: 'alphabetic',
            color: 0x000000,
          },
        ],
      },
    ],
    stats: { paths: 3, segments: 3, fills: 1, texts: 1, blocks: 0 },
  };

  it('draws the display list as vector content at the paper size (EXP-04)', async () => {
    const out = await PDFDocument.create();
    const fonts = await embedFonts(out);
    addCadPage(out, list, fonts, 'color', overlay('HV-7', 300, 200));
    addCadPage(out, list, fonts, 'monochrome', overlay('HV-8', 300, 200));
    const bytes = await out.save();
    const saved = await PDFDocument.load(bytes);
    expect(saved.getPage(0).getSize()).toEqual({ width: 1190.55, height: 841.89 });

    const pdf = await readBack(bytes);
    expect(pdf.numPages).toBe(2);
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((item) => 'str' in item) as {
      str: string;
      transform: number[];
    }[];
    const text = items.find((item) => item.str === 'P-101')!;
    const [x, y] = viewport.convertToViewportPoint(text.transform[4]!, text.transform[5]!);
    expect(x).toBeCloseTo(400, 3);
    expect(y).toBeCloseTo(500, 3);
    expect(items.map((item) => item.str)).toContain('HV-7');

    // Vector paths only: an even-odd fill for the hatch, strokes, no images.
    // PDF.js batches each path into constructPath with its paint operator first.
    const { fnArray, argsArray } = await page.getOperatorList();
    const paints = fnArray
      .map((fn, i) => (fn === pdfjs.OPS.constructPath ? (argsArray[i] as number[])[0] : null))
      .filter((op) => op !== null);
    expect(paints).toContain(pdfjs.OPS.eoFill);
    expect(paints).toContain(pdfjs.OPS.stroke);
    expect(fnArray).not.toContain(pdfjs.OPS.paintImageXObject);
  });
});
