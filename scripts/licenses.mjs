// Third-party licences for the build (GPL-3.0 §4–6: notices and licences go
// with every copy). Walks the production dependency tree from package.json,
// as Node resolves it, and collects each package's licence and notice files.
import { existsSync, realpathSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const LICENCE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** The folder of a dependency as Node would find it from `fromDir`, or null. */
function findPackage(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return realpathSync(dirname(candidate));
    if (dirname(dir) === dir) return null;
  }
}

function licenceOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
}

function repositoryOf(pkg) {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return (repo ?? pkg.homepage ?? '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^github:/, 'https://github.com/');
}

/**
 * @param {string} root the project folder
 * @returns {Promise<{ name: string, version: string, license: string, repository: string, texts: { file: string, text: string }[] }[]>}
 */
export async function collectLicenses(root) {
  const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const found = new Map();
  const queue = Object.keys(project.dependencies ?? {}).map((name) => [name, root]);
  while (queue.length) {
    const [name, fromDir] = queue.shift();
    const dir = findPackage(name, fromDir);
    if (!dir) continue;
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (found.has(key)) continue;
    const texts = [];
    for (const file of (await readdir(dir)).filter((f) => LICENCE_FILE.test(f)).sort()) {
      texts.push({ file, text: (await readFile(join(dir, file), 'utf8')).trim() });
    }
    found.set(key, {
      name: pkg.name,
      version: pkg.version,
      license: licenceOf(pkg),
      repository: repositoryOf(pkg),
      texts,
    });
    // Optional dependencies are platform builds for Node (e.g. canvas for pdf.js),
    // never part of the web app.
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push([dep, dir]);
  }
  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/** Notices for packages that ship without their licence text. */
const EXTRA_NOTICES = {
  '@mlightcad/libredwg-web':
    'Reads native DWG files: a WebAssembly build of GNU LibreDWG.\n' +
    'LibreDWG: Copyright (C) Free Software Foundation, Inc., under the GNU General\n' +
    'Public License, version 3 or later: https://www.gnu.org/software/libredwg/\n' +
    'Source: https://git.savannah.gnu.org/git/libredwg.git and\n' +
    'https://github.com/mlightcad/libredwg-web (see SOURCE.md for the versions).\n' +
    'The GPL-3.0 text is in LICENSE.txt.',
};

/** The THIRD_PARTY_LICENSES.txt text. */
export function thirdPartyNotice(packages, appName = 'QRA Parts Count Tool') {
  const rule = '-'.repeat(78);
  const lines = [
    `${appName}: third-party software`,
    '='.repeat(78),
    '',
    `${appName} is free software under the GNU General Public License, version 3`,
    'or later (LICENSE.txt). It includes the packages below, each under its own',
    'licence, reproduced here as the package ships it.',
    '',
    ...packages.map((p) => `  ${p.name} ${p.version} (${p.license})`),
  ];
  for (const p of packages) {
    lines.push('', rule, `${p.name} ${p.version}`, `Licence: ${p.license}`);
    if (p.repository) lines.push(`Source: ${p.repository}`);
    lines.push(rule);
    if (EXTRA_NOTICES[p.name]) lines.push('', EXTRA_NOTICES[p.name]);
    else if (p.texts.length === 0) {
      lines.push('', `(No licence file in the package; its licence is ${p.license}.)`);
    }
    for (const t of p.texts) lines.push('', `${t.file}:`, '', t.text);
  }
  return `${lines.join('\n')}\n`;
}
