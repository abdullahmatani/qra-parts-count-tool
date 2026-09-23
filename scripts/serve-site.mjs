// Serves the QRA Parts Count Tool from this folder on http://localhost:8080.
//
//   node serve.mjs              port 8080
//   node serve.mjs --port 9000  another port
//   node serve.mjs --root dir   serve another folder (default: site/ next to this file)
//
// Only this computer can connect (the server listens on 127.0.0.1). Browsers
// allow folder access and offline use on http://localhost, so no certificate
// is needed. Nothing is sent anywhere: the app runs entirely in the browser.
// Requires Node.js 22 or later.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { headersForPath } from './csp.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.icc': 'application/octet-stream',
};

/** An HTTP server for the static site in `root`, with the app's security headers. */
export function createSiteServer(root) {
  const base = resolve(root);
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = resolve(
      base,
      `.${normalize(pathname.endsWith('/') ? `${pathname}index.html` : pathname)}`,
    );
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end();
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const immutable = pathname.startsWith('/assets/') || pathname.startsWith('/workers/');
    res.writeHead(200, {
      ...headersForPath(pathname),
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = (name) => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : undefined;
  };
  const port = Number(arg('--port') ?? process.env.PORT ?? 8080);
  const root = resolve(arg('--root') ?? join(fileURLToPath(new URL('.', import.meta.url)), 'site'));
  const server = createSiteServer(root);
  server.listen(port, '127.0.0.1', () => {
    const { port: actual } = server.address();
    console.log(`QRA Parts Count Tool: open http://localhost:${actual} in Edge or Chrome.`);
    console.log('Press Ctrl+C to stop.');
  });
}
