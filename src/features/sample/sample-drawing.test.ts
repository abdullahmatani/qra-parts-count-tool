// @vitest-environment node
/**
 * The generated sample PEFS: two A3 pages, the same bytes every time, and each
 * tag printed next to the symbol its marker rings (read back with PDF.js).
 */
import { PDFDocument } from 'pdf-lib';
import type * as PdfjsModule from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import { SAMPLE_SHEETS, SHEET } from './sample-layout';
import { drawSamplePdf } from './sample-drawing';

type Pdfjs = typeof PdfjsModule;

describe('sample drawing', () => {
  it('draws both sheets at A3, deterministically', async () => {
    const bytes = await drawSamplePdf();
    expect(await drawSamplePdf()).toEqual(bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPages().map((p) => p.getSize())).toEqual([
      { width: SHEET.width, height: SHEET.height },
      { width: SHEET.width, height: SHEET.height },
    ]);
  });

  it('prints each tag beside its symbol', async () => {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
    const task = pdfjs.getDocument({
      data: await drawSamplePdf(),
      disableFontFace: true,
      verbosity: 0,
    });
    const pdf = await task.promise;
    try {
      for (const [index, sheet] of SAMPLE_SHEETS.entries()) {
        const page = await pdf.getPage(index + 1);
        const viewport = page.getViewport({ scale: 1 });
        const items = (await page.getTextContent()).items.filter((i) => 'str' in i) as {
          str: string;
          transform: number[];
        }[];
        const strings = items.map((i) => i.str);
        expect(strings).toContain(sheet.drawingNo);
        for (const symbol of sheet.symbols) {
          if (symbol.showTag === false || symbol.kind === 'instrument') continue;
          const hit = items.find((i) => i.str === symbol.tag);
          expect(hit, symbol.tag).toBeDefined();
          const [x, y] = viewport.convertToViewportPoint(hit!.transform[4]!, hit!.transform[5]!);
          // Within 60 pt of the symbol centre (tags sit above or below).
          expect(Math.hypot(x - symbol.x, y - symbol.y), symbol.tag).toBeLessThan(60);
        }
      }
    } finally {
      await task.destroy();
    }
  });
});
