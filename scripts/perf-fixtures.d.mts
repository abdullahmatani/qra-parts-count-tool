export declare const PERF_DIR: URL;
export declare const HEAVY_PDF: string;
export declare const HEAVY_DXF: string;
export declare function heavyPdf(options?: {
  rows?: number;
  symbolsPerRow?: number;
  seed?: number;
}): Promise<{ bytes: Uint8Array; symbols: number }>;
export declare function heavyDxf(options?: {
  rows?: number;
  symbolsPerRow?: number;
  seed?: number;
}): { text: string; symbols: number };
export declare function ensurePerfFixtures(): Promise<{ pdf: URL; dxf: URL }>;
