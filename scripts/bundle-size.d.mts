export declare const INITIAL_JS_BUDGET_BYTES: number;
export declare function initialScripts(html: string): string[];
export declare function gzipSize(buffer: Uint8Array): number;
export declare function measureInitialJs(
  distDir: string,
): Promise<{ entries: { file: string; raw: number; gzip: number }[]; total: number }>;
export declare function formatBytes(bytes: number): string;
