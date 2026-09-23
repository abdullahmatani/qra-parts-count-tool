// Fails when the initial JavaScript exceeds the budget. Run after `pnpm build`.
import { resolve } from 'node:path';
import { INITIAL_JS_BUDGET_BYTES, formatBytes, measureInitialJs } from './bundle-size.mjs';

const dist = resolve(import.meta.dirname, '..', 'dist');
const { entries, total } = await measureInitialJs(dist);

if (entries.length === 0) {
  console.error('No initial scripts found in dist/index.html. Run `pnpm build` first.');
  process.exit(1);
}

for (const entry of entries) {
  console.log(
    `${formatBytes(entry.gzip).padStart(10)} gzip  ${formatBytes(entry.raw).padStart(10)} raw  ${entry.file}`,
  );
}
const pct = ((total / INITIAL_JS_BUDGET_BYTES) * 100).toFixed(1);
console.log(
  `\nInitial JS: ${formatBytes(total)} gzipped of ${formatBytes(INITIAL_JS_BUDGET_BYTES)} budget (${pct}%).`,
);

if (total > INITIAL_JS_BUDGET_BYTES) {
  console.error('Bundle-size budget exceeded (FDS section 9.1). Code-split heavy libraries.');
  process.exit(1);
}
