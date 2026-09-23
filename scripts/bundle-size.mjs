// Bundle-size budget helpers (FDS section 9.1: initial JavaScript under 1.5 MB gzipped).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const INITIAL_JS_BUDGET_BYTES = 1.5 * 1024 * 1024;

/**
 * Lists the JavaScript files the browser loads before the app starts: the entry
 * module script and every module preloaded by index.html. Lazily imported
 * chunks (PDF.js, ExcelJS, pdf-lib, DWG readers) are excluded by design.
 */
export function initialScripts(html) {
  const files = new Set();
  for (const match of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
    files.add(match[1]);
  }
  for (const match of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
    files.add(match[1]);
  }
  return [...files].map((file) => file.replace(/^\.?\//, ''));
}

export function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

export async function measureInitialJs(distDir) {
  const html = await readFile(join(distDir, 'index.html'), 'utf8');
  const files = initialScripts(html);
  const entries = [];
  for (const file of files) {
    const content = await readFile(join(distDir, file));
    entries.push({ file, raw: content.length, gzip: gzipSize(content) });
  }
  const total = entries.reduce((sum, entry) => sum + entry.gzip, 0);
  return { entries, total };
}

export function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} kB`;
}
