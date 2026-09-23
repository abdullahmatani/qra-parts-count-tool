import type { Size2D } from '@/domain/schema/types';
import type { TextBox } from '@/domain/text-search';
import type { DrawingSource, RenderRequest, RenderTask } from '../drawing-source';
import { BASE_SCALE, viewMatrix } from '../view-transform';
import { openPdf, type PDFDocumentProxy, type PDFPageProxy } from './pdfjs';

/**
 * One PDF page as a drawing (DRW-01). Drawing coordinates are the page's
 * PDF.js viewport at scale 1 with the page's own /Rotate applied.
 */
export class PdfPageSource implements DrawingSource {
  readonly size: Size2D;
  private readonly page: PDFPageProxy;
  private readonly release: () => void;

  constructor(page: PDFPageProxy, release: () => void) {
    this.page = page;
    this.release = release;
    const viewport = page.getViewport({ scale: 1 });
    this.size = { width: viewport.width, height: viewport.height };
  }

  async renderPreview(maxDimension: number): Promise<HTMLCanvasElement> {
    const scale = Math.min(4, maxDimension / Math.max(this.size.width, this.size.height));
    const viewport = this.page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await this.page.render({ canvas, viewport }).promise;
    return canvas;
  }

  render({ canvas, view, canvasSize, devicePixelRatio: dpr }: RenderRequest): RenderTask {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { promise: Promise.resolve(), cancel: () => {} };

    const m = viewMatrix(view, canvasSize);
    // White sheet under the drawing, in drawing coordinates.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.size.width, this.size.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Let PDF.js render at the exact scale and rotation, then shift the result so
    // that the drawing origin lands where the view matrix puts it. Only the part
    // inside the canvas is rasterised, so any zoom up to 3200 % stays sharp.
    const scale = view.zoom * BASE_SCALE * dpr;
    const rotation = (this.page.rotate + view.rotation) % 360;
    const viewport = this.page.getViewport({ scale, rotation });
    const unit = this.page.getViewport({ scale: 1 });
    const [px, py] = unit.convertToPdfPoint(0, 0) as [number, number];
    const [qx, qy] = viewport.convertToViewportPoint(px, py) as [number, number];
    const transform = [1, 0, 0, 1, m[4] * dpr - qx, m[5] * dpr - qy];

    const task = this.page.render({
      canvas,
      viewport,
      transform,
      background: 'rgba(0,0,0,0)',
    });
    return { promise: task.promise, cancel: () => task.cancel() };
  }

  /**
   * DRW-08: the page's text runs as boxes in drawing coordinates. Each run's
   * text-space box (advance × font size) is mapped through the page transform
   * and viewport, so rotated text and rotated pages get the right box.
   */
  async textBoxes(): Promise<TextBox[]> {
    const viewport = this.page.getViewport({ scale: 1 });
    const content = await this.page.getTextContent();
    const boxes: TextBox[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform as number[];
      const along = Math.hypot(a, b) || 1;
      const up = Math.hypot(c, d) || 1;
      const width = item.width || item.str.length * up * 0.5;
      const height = item.height || up;
      const corners = [
        [e, f],
        [e + (a / along) * width, f + (b / along) * width],
        [e + (c / up) * height, f + (d / up) * height],
        [e + (a / along) * width + (c / up) * height, f + (b / along) * width + (d / up) * height],
      ].map(([x, y]) => viewport.convertToViewportPoint(x!, y!) as [number, number]);
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      boxes.push({ text: item.str, x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y });
    }
    return boxes;
  }

  prepare(): void {
    // A tiny render makes PDF.js parse the page and keep its operator list.
    this.renderPreview(64).catch(() => {});
  }

  /** `cleanup: false` keeps the parsed page for a viewer that shows the same page. */
  dispose(cleanup = true): void {
    if (cleanup) this.page.cleanup();
    this.release();
  }
}

interface CachedDocument {
  promise: Promise<PDFDocumentProxy>;
  users: number;
  lastUsed: number;
}

/**
 * Keeps recently used PDF documents open, so switching between the pages of a
 * multi-page file (or back to a recent drawing) is instant.
 */
export class PdfDocumentCache {
  private readonly documents = new Map<string, CachedDocument>();
  private readonly capacity: number;

  constructor(capacity = 4) {
    this.capacity = capacity;
  }

  async openPage(
    key: string,
    load: () => Promise<ArrayBuffer>,
    pageNumber: number,
  ): Promise<PdfPageSource> {
    let entry = this.documents.get(key);
    if (!entry) {
      entry = { promise: load().then((bytes) => openPdf(bytes)), users: 0, lastUsed: 0 };
      this.documents.set(key, entry);
      entry.promise.catch(() => this.documents.delete(key));
    }
    entry.users += 1;
    entry.lastUsed = Date.now();
    const current = entry;
    try {
      const doc = await entry.promise;
      const page = await doc.getPage(pageNumber);
      this.evict();
      return new PdfPageSource(page, () => {
        current.users -= 1;
        current.lastUsed = Date.now();
        this.evict();
      });
    } catch (error) {
      current.users -= 1;
      throw error;
    }
  }

  private evict(): void {
    if (this.documents.size <= this.capacity) return;
    const idle = [...this.documents.entries()]
      .filter(([, entry]) => entry.users <= 0)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    for (const [key, entry] of idle) {
      if (this.documents.size <= this.capacity) break;
      this.documents.delete(key);
      void entry.promise.then((doc) => doc.loadingTask.destroy()).catch(() => {});
    }
  }

  clear(): void {
    for (const entry of this.documents.values()) {
      void entry.promise.then((doc) => doc.loadingTask.destroy()).catch(() => {});
    }
    this.documents.clear();
  }
}
