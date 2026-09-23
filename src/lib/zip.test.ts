// @vitest-environment node
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createZip } from '../../scripts/zip.mjs';
import { ZipError, crc32, createZip as createBrowserZip, readZip } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('zip (PRJ-08)', () => {
  it('computes CRC-32', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips entries, compressed or stored', async () => {
    const entries = [
      { name: 'project.qrapc.json', data: bytes('{"a":1}'.repeat(100)) },
      { name: 'drawings/PEFS 1.pdf', data: new Uint8Array([1, 2, 3]) },
      { name: 'notes/ü.txt', data: bytes('ü') },
    ];
    const blob = await createBrowserZip(entries);
    const read = await readZip(await blob.arrayBuffer());
    expect(read).toEqual(entries);
  });

  it('reads archives made by other tools', async () => {
    // The site packager's Node writer (deflate via zlib) stands in for other zip tools.
    const zip = createZip([{ name: 'folder/a.txt', data: bytes('hello hello hello') }]);
    expect(await readZip(zip)).toEqual([
      { name: 'folder/a.txt', data: bytes('hello hello hello') },
    ]);
    expect(deflateRawSync(bytes('x')).length).toBeGreaterThan(0);
  });

  it('refuses paths that escape the folder and damaged data', async () => {
    for (const name of ['../evil.txt', '/etc/passwd', 'a/../../b', 'C:/x.txt']) {
      const blob = await createBrowserZip([{ name, data: bytes('x') }]);
      await expect(readZip(await blob.arrayBuffer())).rejects.toThrow(ZipError);
    }
    const blob = await createBrowserZip([{ name: 'a.txt', data: bytes('stored') }]);
    const damaged = new Uint8Array(await blob.arrayBuffer());
    damaged[36] ^= 0xff; // flip a byte of the stored content (after 30 + 5 header bytes)
    await expect(readZip(damaged)).rejects.toThrow(/damaged/);
    await expect(readZip(bytes('not a zip at all, just text'))).rejects.toThrow(/Not a ZIP/);
  });

  it('refuses archives that expand too far', async () => {
    const blob = await createBrowserZip([{ name: 'big.bin', data: new Uint8Array(10_000) }]);
    await expect(readZip(await blob.arrayBuffer(), { maxTotalBytes: 1000 })).rejects.toThrow(
      /too large/,
    );
  });
});
