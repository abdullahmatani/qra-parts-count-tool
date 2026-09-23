/**
 * Serves (dev) and emits (build) the PDF.js resources that are fetched at run
 * time: standard fonts, CMaps, WASM image decoders and ICC profiles. They are
 * part of the build, so the service worker precaches them and PDF rendering
 * works offline and under `connect-src 'self'` (NFR-01, FDS section 2).
 */
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

const FOLDERS = ['standard_fonts', 'cmaps', 'wasm', 'iccs'];
/** PDF JavaScript (scripting) is never executed, so its engine is not shipped. */
const EXCLUDE = /quickjs/;
export const PDFJS_ASSET_BASE = 'pdfjs';

function pdfjsRoot(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('pdfjs-dist/package.json'));
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (!EXCLUDE.test(entry)) out.push(full);
  }
  return out;
}

const MIME: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.icc': 'application/octet-stream',
  '.js': 'text/javascript',
};

export function pdfjsAssets(): Plugin {
  const root = pdfjsRoot();
  const files = FOLDERS.flatMap((folder) => listFiles(join(root, folder)));
  const publicPath = (file: string) =>
    `${PDFJS_ASSET_BASE}/${relative(root, file).split(sep).join('/')}`;

  return {
    name: 'qrapc-pdfjs-assets',
    configureServer(server) {
      const byPath = new Map(files.map((file) => [`/${publicPath(file)}`, file]));
      server.middlewares.use((req, res, next) => {
        const file = req.url ? byPath.get(req.url.split('?')[0]!) : undefined;
        if (!file) return next();
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: 'asset', fileName: publicPath(file), source: readFileSync(file) });
      }
    },
  };
}
