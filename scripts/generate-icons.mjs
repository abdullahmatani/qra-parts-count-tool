// Renders the PWA icons from public/favicon.svg using the Playwright Chromium build.
// Run with `node scripts/generate-icons.mjs` after changing the favicon; the PNGs are committed.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

async function render(size, file, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need a full-bleed background and content inside the 80% safe zone.
  const inner = maskable ? Math.round(size * 0.72) : size;
  await page.setContent(
    `<html><body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${maskable ? '#0f172a' : 'transparent'}">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  );
  const png = await page.screenshot({ omitBackground: !maskable, type: 'png' });
  await writeFile(new URL(`../public/${file}`, import.meta.url), png);
  console.log(`wrote public/${file}`);
}

await render(192, 'pwa-192x192.png');
await render(512, 'pwa-512x512.png');
await render(512, 'maskable-icon-512x512.png', { maskable: true });
await render(180, 'apple-touch-icon.png', { maskable: true });
await browser.close();
