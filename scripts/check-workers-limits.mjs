// Fails when the build does not fit Cloudflare Workers static assets, the live
// site's host. Run after `pnpm build`.
import { resolve } from 'node:path';
import { formatBytes } from './bundle-size.mjs';
import { checkWorkersLimits } from './workers-limits.mjs';

const dist = resolve(import.meta.dirname, '..', 'dist');
const { files, largest, problems } = await checkWorkersLimits(dist).catch(() => ({
  files: [],
  largest: null,
  problems: ['No build found in dist/. Run `pnpm build` first.'],
}));

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error('The build does not fit Cloudflare Workers static assets.');
  process.exit(1);
}
console.log(
  `Cloudflare Workers: ${files.length} files, largest ${largest.path} (${formatBytes(largest.bytes)}); within the static-asset limits.`,
);
