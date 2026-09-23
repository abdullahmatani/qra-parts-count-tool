// Packages the production build as a zipped static site (FDS section 8.2,
// roadmap #47): release/qra-parts-count-tool-<version>.zip with the app in
// site/, a local server (serve.mjs) and a README. Run `pnpm build` first.
//   node scripts/package-site.mjs
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './zip.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(path)));
    else out.push(path);
  }
  return out.sort();
}

function readme(version) {
  return `QRA Parts Count Tool ${version}
==============================

A web application for QRA parts counts on PEFS/P&ID drawings. It runs
entirely in your browser: drawings, counts and exports stay on your computer.

Run it on this computer
-----------------------
1. Install Node.js 22 or later (https://nodejs.org) if it is not installed.
2. In this folder, run:   node serve.mjs
3. Open http://localhost:8080 in Microsoft Edge or Google Chrome.

Open the app once while the server runs; after that it also works offline.
Use --port 9000 to choose another port.

Host it for a team
------------------
Copy the contents of site/ to any static web server served over HTTPS.
site/_headers lists the security headers to send (Content-Security-Policy
for the page and for workers/). The app has no backend.

Documentation: docs/user-guide.md in the source repository.
`;
}

/**
 * @param {{ distDir?: string, outDir?: string, version?: string }} [options]
 * @returns {Promise<string>} the path of the zip file
 */
export async function packageSite(options = {}) {
  const distDir = options.distDir ?? join(ROOT, 'dist');
  const outDir = options.outDir ?? join(ROOT, 'release');
  const version =
    options.version ?? JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version;
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`No build in ${distDir}. Run "pnpm build" first.`);
  }
  const folder = `qra-parts-count-tool-${version}`;
  const entries = [
    { name: `${folder}/README.txt`, data: Buffer.from(readme(version)) },
    { name: `${folder}/serve.mjs`, data: await readFile(join(ROOT, 'scripts/serve-site.mjs')) },
    { name: `${folder}/csp.mjs`, data: await readFile(join(ROOT, 'scripts/csp.mjs')) },
  ];
  for (const file of await listFiles(distDir)) {
    // Source maps are for development; they would triple the download.
    if (file.endsWith('.map')) continue;
    const name = relative(distDir, file).split(sep).join('/');
    entries.push({ name: `${folder}/site/${name}`, data: await readFile(file) });
  }
  await mkdir(outDir, { recursive: true });
  const zipPath = join(outDir, `${folder}.zip`);
  await writeFile(zipPath, createZip(entries));
  return zipPath;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const zip = await packageSite();
  console.log(`Wrote ${relative(ROOT, zip)}`);
}
