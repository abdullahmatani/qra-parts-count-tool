/**
 * The PDF.js web worker, with the polyfills its legacy build leaves out. PDF.js
 * starts it from the URL that pdfjs.ts sets as GlobalWorkerOptions.workerSrc;
 * the worker answers PDF.js as soon as it is loaded.
 */
import './polyfills';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
