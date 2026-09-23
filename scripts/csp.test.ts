// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, CSP_HEADER, CSP_META, SECURITY_HEADERS } from './csp.mjs';

describe('Content Security Policy (FDS 2, 9.1)', () => {
  it('contains the FDS baseline directives', () => {
    expect(CSP_META).toContain("default-src 'self'");
    expect(CSP_META).toContain("connect-src 'self'");
    expect(CSP_META).toContain("worker-src 'self' blob:");
    expect(CSP_META).toContain("img-src 'self' blob: data:");
  });

  it('allows no third-party origin in any directive', () => {
    const allowedSources = new Set([
      "'self'",
      "'none'",
      'blob:',
      'data:',
      "'wasm-unsafe-eval'",
      "'unsafe-inline'",
    ]);
    for (const [name, values] of Object.entries(CSP_DIRECTIVES)) {
      for (const value of values) {
        expect(allowedSources.has(value), `${name} ${value}`).toBe(true);
      }
    }
    expect(CSP_META).not.toMatch(/https?:|\*/);
  });

  it('never allows eval of JavaScript or inline scripts', () => {
    expect(CSP_DIRECTIVES['script-src']).not.toContain("'unsafe-eval'");
    expect(CSP_DIRECTIVES['script-src']).not.toContain("'unsafe-inline'");
  });

  it('adds frame-ancestors only to the header form', () => {
    expect(CSP_META).not.toContain('frame-ancestors');
    expect(CSP_HEADER).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(CSP_HEADER);
  });
});
