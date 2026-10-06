// Packages the production build as a zipped static site (FDS section 8.2,
// roadmap #47): release/qra-parts-count-tool-<version>.zip with the app in
// site/, a local server (serve.mjs), a README, the GPL-3.0 licence and where
// to get the source (SOURCE.md). From a git checkout it also writes the
// source of the same commit: release/qra-parts-count-tool-<version>-source.zip.
// Run `pnpm build` first.
//   node scripts/package-site.mjs
import { execFileSync } from 'node:child_process';
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

Licence
-------
Free software under the GNU General Public License, version 3 or later
(LICENSE.txt), with no warranty. SOURCE.md says where the source code is;
site/THIRD_PARTY_LICENSES.txt lists the components and their licences.

Documentation: built into the app (F1, or the ? button in the header), and
in docs/help/ in the source repository.
`;
}

function sourceNotice({ version, repository, commit, libredwgWeb }) {
  return `# Source code

QRA Parts Count Tool ${version} is free software under the GNU General Public License,
version 3 or later (LICENSE.txt). You may run, copy, change and share it under that licence.

## This application

- Repository: ${repository}
- Commit: ${commit ?? 'see the release notes of this version'}
- The source of that commit is in \`qra-parts-count-tool-${version}-source.zip\` next to this
  package when it was made from a git checkout.
- Build it with Node.js 22 and pnpm 10: \`pnpm install --frozen-lockfile && pnpm build\`. The
  lockfile pins every dependency.

## GNU LibreDWG (native DWG reading)

Native DWG files are read by a WebAssembly build of GNU LibreDWG from the npm package
\`@mlightcad/libredwg-web\` ${libredwgWeb}, both under the GNU GPL v3 or later:

- https://github.com/mlightcad/libredwg-web (version ${libredwgWeb}): bindings and build scripts
- https://www.gnu.org/software/libredwg/ (https://git.savannah.gnu.org/git/libredwg.git): LibreDWG

Whoever passes this package on must make these sources available with it (GPL-3.0 section 6).

## Other components

\`site/THIRD_PARTY_LICENSES.txt\` lists every included package with its licence.
`;
}

/** The current commit, or null outside a git checkout. */
function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * @param {{ distDir?: string, outDir?: string, version?: string, sourceArchive?: boolean }} [options]
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
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const libredwgWeb = JSON.parse(
    await readFile(join(ROOT, 'node_modules/@mlightcad/libredwg-web/package.json'), 'utf8'),
  ).version;
  const commit = gitCommit();
  const entries = [
    { name: `${folder}/README.txt`, data: Buffer.from(readme(version)) },
    { name: `${folder}/LICENSE.txt`, data: await readFile(join(ROOT, 'LICENSE')) },
    {
      name: `${folder}/SOURCE.md`,
      data: Buffer.from(sourceNotice({ version, repository: pkg.homepage, commit, libredwgWeb })),
    },
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
  // The corresponding source (GPL-3.0 section 6), as committed.
  if (options.sourceArchive !== false && commit) {
    execFileSync(
      'git',
      [
        'archive',
        '--format=zip',
        `--prefix=${folder}-source/`,
        `--output=${join(outDir, `${folder}-source.zip`)}`,
        commit,
      ],
      { cwd: ROOT },
    );
  }
  return zipPath;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const zip = await packageSite();
  console.log(`Wrote ${relative(ROOT, zip)}`);
}
