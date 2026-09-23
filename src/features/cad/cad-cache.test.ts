// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMemoryFs } from '@/test/memory-fs';
import { cachePath, readCachedDisplayList, spaceKey, writeCachedDisplayList } from './cad-cache';
import { buildDisplayList } from './display-list';
import { emptyCadDocument } from './model';

const HASH = 'a'.repeat(64);

function list(space = 'Model') {
  const doc = emptyCadDocument('test');
  doc.modelSpace.push({
    layer: '0',
    color: { kind: 'aci', index: 1 },
    type: 'line',
    start: [0, 0],
    end: [10, 10],
  });
  return { ...buildDisplayList(doc, 'Model'), space };
}

describe('CAD render cache (cache/, rebuildable)', () => {
  it('stores display lists gzipped per file hash and space, and reads them back', async () => {
    const dir = createMemoryFs();
    const original = list();
    await writeCachedDisplayList(dir, HASH, original);
    expect(dir.tree()).toContain(cachePath(HASH, 'Model'));
    expect(await readCachedDisplayList(dir, HASH, 'Model')).toEqual(original);
  });

  it('keeps layouts with awkward names apart', () => {
    expect(spaceKey('A1 / Sheet 1')).not.toBe(spaceKey('A1 _ Sheet 1'));
    expect(spaceKey('Model')).toMatch(/^Model-[0-9a-z]+$/);
  });

  it('treats missing, stale and corrupt entries as a cache miss', async () => {
    const dir = createMemoryFs();
    expect(await readCachedDisplayList(dir, HASH, 'Model')).toBeNull();
    await writeCachedDisplayList(dir, HASH, { ...list(), version: 0 });
    expect(await readCachedDisplayList(dir, HASH, 'Model')).toBeNull();
    const handle = await (await dir.getDirectoryHandle('cache')).getDirectoryHandle('cad');
    const folder = await handle.getDirectoryHandle(HASH);
    const file = await folder.getFileHandle(cachePath(HASH, 'Model').split('/').pop()!);
    const w = await file.createWritable();
    await w.write('not gzip');
    await w.close();
    expect(await readCachedDisplayList(dir, HASH, 'Model')).toBeNull();
  });
});
