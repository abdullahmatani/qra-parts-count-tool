// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { WORKER_CSP } from './csp.mjs';
import { packageSite } from './package-site.mjs';
import { createSiteServer } from './serve-site.mjs';
import { createZip } from './zip.mjs';

/** Reads a zip written by createZip (central directory, stored or deflated). */
function readZip(zip: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const offset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const body = zip.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    p += 46 + nameLength;
  }
  return out;
}

const temps: string[] = [];
afterAll(async () => {
  await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'qrapc-site-'));
  temps.push(dir);
  return dir;
}

describe('zipped static site (roadmap #47)', () => {
  it('writes zips that read back byte for byte', () => {
    const text = Buffer.from('hello '.repeat(200));
    const random = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7919) % 256));
    const zip = createZip([
      { name: 'a/b.txt', data: text },
      { name: 'ü.bin', data: random },
    ]);
    const files = readZip(zip);
    expect(files.get('a/b.txt')).toEqual(text);
    expect(files.get('ü.bin')).toEqual(random);
    // Same input, same archive.
    expect(createZip([{ name: 'a/b.txt', data: text }])).toEqual(
      createZip([{ name: 'a/b.txt', data: text }]),
    );
  });

  it('packages the build with the local server and no source maps', async () => {
    const dist = await tempDir();
    await mkdir(join(dist, 'assets'));
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>QRA</title>');
    await writeFile(join(dist, 'assets/app.js'), 'console.log(1)');
    await writeFile(join(dist, 'assets/app.js.map'), '{}');
    const zipPath = await packageSite({
      distDir: dist,
      outDir: await tempDir(),
      version: '9.9.9',
      sourceArchive: false,
    });
    expect(zipPath).toMatch(/qra-parts-count-tool-9\.9\.9\.zip$/);
    const files = readZip(await readFile(zipPath));
    expect([...files.keys()].sort()).toEqual([
      'qra-parts-count-tool-9.9.9/LICENSE.txt',
      'qra-parts-count-tool-9.9.9/README.txt',
      'qra-parts-count-tool-9.9.9/SOURCE.md',
      'qra-parts-count-tool-9.9.9/csp.mjs',
      'qra-parts-count-tool-9.9.9/serve.mjs',
      'qra-parts-count-tool-9.9.9/site/assets/app.js',
      'qra-parts-count-tool-9.9.9/site/index.html',
    ]);
    expect(files.get('qra-parts-count-tool-9.9.9/README.txt')!.toString()).toContain(
      'node serve.mjs',
    );
    // GPL-3.0: the licence and where the source is go with every copy.
    expect(files.get('qra-parts-count-tool-9.9.9/LICENSE.txt')!.toString()).toContain(
      'GNU GENERAL PUBLIC LICENSE',
    );
    const source = files.get('qra-parts-count-tool-9.9.9/SOURCE.md')!.toString();
    expect(source).toContain('https://github.com/abdullahmatani/qra-parts-count-tool');
    expect(source).toMatch(/@mlightcad\/libredwg-web` \d+\.\d+\.\d+/);
    expect(source).toContain('git.savannah.gnu.org/git/libredwg.git');
  });

  it('refuses to package without a build', async () => {
    await expect(
      packageSite({ distDir: await tempDir(), outDir: await tempDir() }),
    ).rejects.toThrow(/pnpm build/);
  });

  it('serves the site with the security headers, and nothing outside it', async () => {
    const site = await tempDir();
    await mkdir(join(site, 'workers'));
    await writeFile(join(site, 'index.html'), '<!doctype html>');
    await writeFile(join(site, 'workers/dwg.worker.js'), '1');
    await writeFile(join(site, 'reader.wasm'), Buffer.from([0, 97, 115, 109]));
    await writeFile(join(site, '..', 'secret.txt'), 'no');
    const server = createSiteServer(site);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-security-policy')).toContain("connect-src 'self'");
      expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(page.headers.get('cache-control')).toBe('no-cache');

      const worker = await fetch(`${base}/workers/dwg.worker.js`);
      expect(worker.headers.get('content-security-policy')).toBe(WORKER_CSP);
      expect(worker.headers.get('content-type')).toMatch(/javascript/);
      expect(worker.headers.get('cache-control')).toContain('immutable');

      expect((await fetch(`${base}/reader.wasm`)).headers.get('content-type')).toBe(
        'application/wasm',
      );
      expect((await fetch(`${base}/missing.js`)).status).toBe(404);
      for (const escape of [
        '/..%2Fsecret.txt',
        '/%2e%2e/secret.txt',
        '/workers/..%2F..%2Fsecret.txt',
      ]) {
        const response = await fetch(`${base}${escape}`);
        expect([403, 404]).toContain(response.status);
        expect(await response.text()).not.toBe('no');
      }
      expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
