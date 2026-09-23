/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import {
  COMMON_HEADERS,
  CSP_META,
  SECURITY_HEADERS,
  WORKER_CSP,
  WORKERS_DIR,
  headersForPath,
} from './scripts/csp.mjs';
import { pdfjsAssets } from './scripts/vite-plugin-pdfjs-assets.ts';

/**
 * Adds the Content Security Policy to index.html in production builds, and writes
 * a `_headers` file (Netlify / Cloudflare Pages format) with the header form.
 * The dev server is left without a CSP because hot reload needs a WebSocket.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'qrapc-content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_META },
          injectTo: 'head-prepend',
        },
        { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head' },
      ],
    },
    generateBundle() {
      // Netlify / Cloudflare Pages format. The page CSP is sent only for the
      // document, and the worker CSP only for worker scripts, so no response
      // ever carries two policies.
      const block = (path: string, headers: Record<string, string>) =>
        `${path}\n${Object.entries(headers)
          .map(([name, value]) => `  ${name}: ${value}`)
          .join('\n')}\n`;
      const source = [
        block('/*', COMMON_HEADERS),
        block('/', { 'Content-Security-Policy': SECURITY_HEADERS['Content-Security-Policy']! }),
        block('/index.html', {
          'Content-Security-Policy': SECURITY_HEADERS['Content-Security-Policy']!,
        }),
        block(`/${WORKERS_DIR}/*`, { 'Content-Security-Policy': WORKER_CSP }),
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: '_headers', source });
    },
  };
}

/** `vite preview` sends the same per-path security headers as the static host. */
function previewSecurityHeaders(): Plugin {
  return {
    name: 'qrapc-preview-security-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [name, value] of Object.entries(headersForPath(req.url ?? '/'))) {
          res.setHeader(name, value);
        }
        next();
      });
    },
  };
}

/** VITE_DWG_READER=none builds without the GPL-3.0 LibreDWG reader (see README). */
const dwgReader = process.env.VITE_DWG_READER === 'none' ? 'none' : 'libredwg';

export default defineConfig({
  // Relative base so the same build works from a public URL, a sub-path on an
  // intranet server, or the zipped static site served from localhost (FDS §9.1).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    previewSecurityHeaders(),
    pdfjsAssets(),
    VitePWA({
      // A new version waits for the user to accept it, so an update never reloads
      // the page in the middle of an edit.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'QRA Parts Count Tool',
        short_name: 'QRA Parts Count',
        description:
          'Offline drawing markup, isolatable segments and leak-source parts count for QRA studies.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache everything the app can ever need, including lazily loaded chunks,
        // workers, WASM and fonts, so every feature works offline (NFR-01).
        globPatterns: [
          '**/*.{js,mjs,css,html,svg,png,ico,woff,woff2,ttf,wasm,json,webmanifest,bcmap,pfb,icc}',
        ],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Take control of the page on first install so it is offline-capable at once.
        clientsClaim: true,
        // No runtime caching of other origins: the app never talks to one.
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: [
      ...(dwgReader === 'none'
        ? [
            {
              find: /^\.\/workers\/dwg-reader$/,
              replacement: fileURLToPath(
                new URL('./src/features/cad/workers/dwg-reader.none.ts', import.meta.url),
              ),
            },
          ]
        : []),
      {
        // The WASM file is not listed in the package's "exports", so it is resolved by path.
        find: /^libredwg-wasm(?=\?|$)/,
        replacement: fileURLToPath(
          new URL('./node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm', import.meta.url),
        ),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: `${WORKERS_DIR}/[name]-[hash].js`,
        chunkFileNames: `${WORKERS_DIR}/[name]-[hash].js`,
      },
    },
  },
  build: {
    target: 'es2023',
    sourcemap: true,
    // Never inline assets as data: URLs; fonts must satisfy `font-src 'self'`
    // and every asset should be a precached file.
    assetsInlineLimit: 0,
    // The initial-JS budget is enforced by `pnpm size`; lazily loaded libraries
    // (PDF.js, ExcelJS, pdf-lib) are legitimately large chunks.
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      onwarn(warning, warn) {
        // Tailwind's generated CSS has no sourcemap; harmless.
        if (warning.code === 'SOURCEMAP_BROKEN') return;
        warn(warning);
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/components/ui/**'],
    },
  },
});
