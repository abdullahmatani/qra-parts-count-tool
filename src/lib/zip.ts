/**
 * ZIP archives in the browser (PRJ-08): write and read the project .zip with
 * the built-in CompressionStream ('deflate-raw'), no library needed. Reading
 * accepts stored and deflated entries and refuses paths that would escape the
 * target folder.
 */

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface ZipEntry {
  /** Path inside the archive, "/"-separated. */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream) {
  const stream = new Response(bytes as Uint8Array<ArrayBuffer>).body!.pipeThrough(
    transform as unknown as TransformStream<Uint8Array, Uint8Array>,
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const canDeflate = () => typeof CompressionStream !== 'undefined';

/** 1 January 2026 in MS-DOS date format; entries carry a fixed date. */
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export async function createZip(entries: readonly ZipEntry[]): Promise<Blob> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const deflated = canDeflate()
      ? await pipe(entry.data, new CompressionStream('deflate-raw'))
      : null;
    const stored = !deflated || deflated.length >= entry.data.length;
    const body = stored ? entry.data : deflated;
    const crc = crc32(entry.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, stored ? 0 : 8, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, body);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(10, stored ? 0 : 8, true);
    record.setUint16(14, DOS_DATE, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, body.length, true);
    record.setUint32(24, entry.data.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    central.push(new Uint8Array(record.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const size = central.reduce((n, part) => n + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: 'application/zip',
  });
}

/** A safe relative path, or null for entries to skip (folders); throws for unsafe ones. */
function safePath(raw: string): string | null {
  const name = raw.replace(/\\/g, '/');
  if (name.endsWith('/')) return null;
  const parts = name.split('/').filter((part) => part !== '' && part !== '.');
  if (name.startsWith('/') || /^[a-z]:/i.test(name) || parts.includes('..') || !parts.length) {
    throw new ZipError(`Unsafe path in archive: ${raw}`);
  }
  return parts.join('/');
}

export interface ReadZipOptions {
  /** Refuse archives that expand beyond this many bytes (default 4 GB). */
  maxTotalBytes?: number;
}

export async function readZip(
  input: ArrayBuffer | Uint8Array,
  options: ReadZipOptions = {},
): Promise<ZipEntry[]> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('Not a ZIP archive.');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  if (p === 0xffffffff || count === 0xffff) throw new ZipError('ZIP64 archives are not supported.');
  const limit = options.maxTotalBytes ?? 4 * 1024 ** 3;
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) {
      throw new ZipError('The archive is damaged.');
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const packed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const raw = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extra + comment;
    const name = safePath(raw);
    if (!name) continue;
    if (flags & 1) throw new ZipError(`Encrypted entry: ${raw}`);
    total += size;
    if (total > limit) throw new ZipError('The archive is too large.');
    const start =
      offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const body = bytes.subarray(start, start + packed);
    let data: Uint8Array;
    if (method === 0) data = body.slice();
    else if (method === 8) data = await pipe(body, new DecompressionStream('deflate-raw'));
    else throw new ZipError(`Unsupported compression in ${raw}.`);
    if (data.length !== size || crc32(data) !== crc) {
      throw new ZipError(`The archive is damaged (${raw}).`);
    }
    entries.push({ name, data });
  }
  return entries;
}
