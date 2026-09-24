/**
 * Emits LICENSE.txt (GPL-3.0) and THIRD_PARTY_LICENSES.txt into the build, so
 * every copy of the app carries its licence and the notices of the packages
 * it includes (GPL-3.0 §4–6). The About tab links to both.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { collectLicenses, thirdPartyNotice } from './licenses.mjs';

export function licenseFiles(root: string): Plugin {
  return {
    name: 'qrapc-licenses',
    apply: 'build',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'LICENSE.txt',
        source: await readFile(join(root, 'LICENSE'), 'utf8'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_LICENSES.txt',
        source: thirdPartyNotice(await collectLicenses(root)),
      });
    },
  };
}
