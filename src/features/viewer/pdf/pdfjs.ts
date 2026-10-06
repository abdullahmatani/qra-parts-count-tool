/**
 * Lazily loads PDF.js (code-split: it is only fetched when the first drawing is
 * opened, FDS section 9.1). Parsing runs in the PDF.js web worker.
 *
 * The "legacy" build is used: PDF.js targets the newest browsers and relies on
 * very recent JavaScript APIs (e.g. Map.getOrInsertComputed); the legacy build
 * includes polyfills, so drawings also open on managed corporate installs of
 * Edge and Chrome that trail the latest release by a few versions. It still
 * skips a few, which polyfills.ts adds here and in the worker (pdf.worker.ts).
 */
import type * as PdfjsModule from 'pdfjs-dist';
import './polyfills';

export type Pdfjs = typeof PdfjsModule;
export type PDFDocumentProxy = PdfjsModule.PDFDocumentProxy;
export type PDFPageProxy = PdfjsModule.PDFPageProxy;

let loading: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('./pdf.worker.ts?worker&url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as Pdfjs;
  })();
  return loading;
}

/** Base URL of the bundled PDF.js resources (see scripts/vite-plugin-pdfjs-assets.ts). */
function assetUrl(folder: string): string {
  return new URL(`pdfjs/${folder}/`, document.baseURI).href;
}

/** Opens a PDF from bytes. The bytes are transferred to the worker. */
export async function openPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    standardFontDataUrl: assetUrl('standard_fonts'),
    cMapUrl: assetUrl('cmaps'),
    cMapPacked: true,
    wasmUrl: assetUrl('wasm'),
    iccUrl: assetUrl('iccs'),
    // Drawings are displayed, never executed: no PDF JavaScript, no XFA forms.
    enableXfa: false,
    isEvalSupported: false,
    stopAtErrors: false,
  } as Parameters<Pdfjs['getDocument']>[0]);
  return task.promise;
}
