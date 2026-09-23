import type { Size2D } from '@/domain/schema/types';
import type { TextItem } from '@/domain/title-block';
import { openPdf } from '@/features/viewer/pdf/pdfjs';

export interface InspectedPage {
  pageNumber: number;
  /** Page size in drawing units (points) with the page's own rotation applied. */
  size: Size2D;
  /** Text positions in the frame where most text reads left to right (see below). */
  text: TextItem[];
  /** Page size in that reading frame. */
  textFrameSize: Size2D;
}

export interface InspectedPdf {
  pages: InspectedPage[];
  /** PDF producer / creator, e.g. "AutoCAD 2024 - DWG To PDF". */
  producer: string;
}

/** DRW-10: PDFs written by CAD plot drivers are marked as plots of DWG drawings. */
export function isCadPlotProducer(producer: string): boolean {
  return /autocad|autodesk|dwg to pdf|microstation|bentley|smartplant|plant ?3d|aveva|intergraph/i.test(
    producer,
  );
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Most common text direction (0/90/180/270° counter-clockwise), weighted by text length. */
export function dominantTextAngle(
  items: readonly { str: string; transform: number[] }[],
  fallback: number,
): number {
  const weights = new Map<number, number>();
  for (const item of items) {
    const [a = 1, b = 0] = item.transform;
    const angle = (((Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90) % 360) + 360) % 360;
    weights.set(angle, (weights.get(angle) ?? 0) + item.str.length);
  }
  let best = fallback;
  let bestWeight = 0;
  for (const [angle, weight] of weights) {
    if (weight > bestWeight) {
      best = angle;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Reads page sizes and text positions from a PDF, one entry per page
 * (DRW-01), for drawing metadata pre-fill (DRW-04).
 */
export async function inspectPdf(bytes: ArrayBuffer): Promise<InspectedPdf> {
  // PDF.js takes ownership of (detaches) the buffer, so give it a copy.
  const doc = await openPdf(new Uint8Array(bytes.slice(0)));
  try {
    const pages: InspectedPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = (content.items as PdfTextItem[]).filter((item) => item.str && item.transform);
      // Title-block heuristics expect horizontal text. A page whose content is
      // drawn rotated (or shown with /Rotate) is analysed in the frame where most
      // text reads left to right: text at angle θ becomes horizontal in a view
      // rotated clockwise by θ.
      const frame = page.getViewport({ scale: 1, rotation: dominantTextAngle(items, page.rotate) });
      const text: TextItem[] = items.map((raw) => {
        const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = raw.transform;
        const [x, y] = frame.convertToViewportPoint(e, f) as [number, number];
        const size = Math.hypot(c, d) || Math.hypot(a, b) || raw.height;
        return { text: raw.str, x, y, width: raw.width, size };
      });
      pages.push({
        pageNumber,
        size: { width: viewport.width, height: viewport.height },
        text,
        textFrameSize: { width: frame.width, height: frame.height },
      });
      page.cleanup();
    }
    const metadata = await doc.getMetadata().catch(() => null);
    const info = (metadata?.info ?? {}) as { Producer?: string; Creator?: string };
    const producer = [info.Creator, info.Producer].filter(Boolean).join(' / ');
    return { pages, producer };
  } finally {
    await doc.loadingTask.destroy();
  }
}
