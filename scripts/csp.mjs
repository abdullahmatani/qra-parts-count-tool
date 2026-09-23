// Content Security Policy (FDS section 2 and 9.1). Single source of truth, used by
// the Vite build (a <meta> tag in index.html), the static-host headers file and
// the local server shipped in the zipped site.
//
// The FDS baseline is:
//   default-src 'self'; connect-src 'self'; worker-src 'self' blob:; img-src 'self' blob: data:
// Additions, none of which allow a third-party origin:
//   script-src 'wasm-unsafe-eval'  compile bundled WebAssembly (PDF.js decoders, DWG reader)
//   style-src 'unsafe-inline'      inline style elements injected by UI libraries (toasts);
//                                   styles cannot send data anywhere with the other directives
//   object-src/frame-src 'none', base-uri 'self', form-action 'none'  hardening

export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'img-src': ["'self'", 'blob:', 'data:'],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

/**
 * Policy for the CAD reader web workers (sent as a header on worker scripts;
 * a <meta> policy does not reach workers). Same no-egress rules as the page,
 * plus 'unsafe-eval': the Emscripten/embind glue of the WASM DWG reader builds
 * functions at run time. Workers only parse drawing files, never run content
 * from them, and still cannot contact any other origin.
 */
export const WORKER_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'"],
  'connect-src': ["'self'"],
  'img-src': ["'self'", 'blob:', 'data:'],
};

/** Directives that only work as an HTTP header, not in a <meta> tag. */
export const CSP_HEADER_ONLY_DIRECTIVES = {
  'frame-ancestors': ["'none'"],
};

export function serializeCsp(directives) {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/** Policy for the <meta http-equiv="Content-Security-Policy"> tag. */
export const CSP_META = serializeCsp(CSP_DIRECTIVES);

/** Policy for an HTTP Content-Security-Policy header. */
export const CSP_HEADER = serializeCsp({ ...CSP_DIRECTIVES, ...CSP_HEADER_ONLY_DIRECTIVES });

export const WORKER_CSP = serializeCsp(WORKER_CSP_DIRECTIVES);

/** Folder of the build that holds web-worker scripts (see vite.config.ts). */
export const WORKERS_DIR = 'workers';

/** Headers for every response. */
export const COMMON_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** Security headers for the HTML document (public URL and the local server). */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP_HEADER,
  ...COMMON_HEADERS,
};

/**
 * Headers for a request path: the page CSP for documents, the worker CSP for
 * worker scripts, and the common headers for everything else. Only one CSP is
 * ever sent per response, because browsers enforce every policy they receive.
 */
export function headersForPath(path) {
  const clean = path.split('?')[0] ?? '/';
  if (clean.includes(`/${WORKERS_DIR}/`) || clean.startsWith(`${WORKERS_DIR}/`)) {
    return { ...COMMON_HEADERS, 'Content-Security-Policy': WORKER_CSP };
  }
  if (clean.endsWith('/') || clean.endsWith('.html')) return SECURITY_HEADERS;
  return COMMON_HEADERS;
}
