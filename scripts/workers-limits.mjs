// Cloudflare Workers static-asset limits, for the live site (wrangler.jsonc).
// The Workers Free plan values, the lower of the two plans:
// https://developers.cloudflare.com/workers/platform/limits/#static-assets
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const WORKERS_LIMITS = {
  files: 20_000,
  fileBytes: 25 * 1024 * 1024,
  headerRules: 100,
  headerLineChars: 2_000,
};

/** Files Workers reads as configuration and does not upload. */
const CONFIG_FILES = new Set(['_headers', '_redirects', '.assetsignore']);

/**
 * What stops a build from deploying as Workers static assets; empty when it fits.
 * @param {{ path: string, bytes: number }[]} files every file of the build, by path within it
 * @param {string | null} headers the `_headers` text, or null without one
 */
export function workersLimitProblems(files, headers) {
  const problems = [];
  const assets = files.filter((f) => !CONFIG_FILES.has(f.path));
  if (assets.length > WORKERS_LIMITS.files) {
    problems.push(`${assets.length} files; Workers takes at most ${WORKERS_LIMITS.files}.`);
  }
  for (const f of assets) {
    if (f.bytes > WORKERS_LIMITS.fileBytes) {
      problems.push(`${f.path} is ${f.bytes} bytes; the limit per file is 25 MiB.`);
    }
  }
  if (headers !== null) {
    const lines = headers.split(/\r?\n/);
    // A rule starts with an unindented path; its headers are indented.
    const rules = lines.filter((l) => /^[^\s#]/.test(l)).length;
    if (rules > WORKERS_LIMITS.headerRules) {
      problems.push(`_headers has ${rules} rules; the limit is ${WORKERS_LIMITS.headerRules}.`);
    }
    lines.forEach((line, i) => {
      if (line.length > WORKERS_LIMITS.headerLineChars) {
        problems.push(
          `_headers line ${i + 1} has ${line.length} characters; the limit is ${WORKERS_LIMITS.headerLineChars}.`,
        );
      }
    });
  }
  return problems;
}

/** Every file under `dir`, with its path relative to `dir` (forward slashes) and size. */
export async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = [];
  for (const entry of entries.filter((e) => e.isFile())) {
    const full = join(entry.parentPath, entry.name);
    files.push({ path: relative(dir, full).split('\\').join('/'), bytes: (await stat(full)).size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Checks a build folder: its files, the largest one and any problems. */
export async function checkWorkersLimits(dir) {
  const files = await listFiles(dir);
  const headers = await readFile(join(dir, '_headers'), 'utf8').catch(() => null);
  const largest = files.reduce((a, b) => (b.bytes > (a?.bytes ?? -1) ? b : a), null);
  return { files, largest, problems: workersLimitProblems(files, headers) };
}
