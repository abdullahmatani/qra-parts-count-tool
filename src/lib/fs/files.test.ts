import { describe, expect, it } from 'vitest';
import { createMemoryFs } from '@/test/memory-fs';
import {
  exists,
  listEntries,
  readText,
  readTextIfExists,
  removeIfExists,
  sanitizeFileName,
  uniqueFileName,
  writeFile,
  writeTextAtomic,
} from './files';

describe('file helpers', () => {
  it('writes and reads nested paths', async () => {
    const dir = createMemoryFs();
    await writeFile(dir, 'a/b/c.txt', 'hello');
    expect(await readText(dir, 'a/b/c.txt')).toBe('hello');
    expect(await exists(dir, 'a/b')).toBe(true);
    expect(await exists(dir, 'a/x.txt')).toBe(false);
    expect(await readTextIfExists(dir, 'nope.txt')).toBeNull();
    expect(await listEntries(dir, 'a')).toEqual([{ name: 'b', kind: 'directory' }]);
    expect(await removeIfExists(dir, 'a/b/c.txt')).toBe(true);
    expect(await removeIfExists(dir, 'a/b/c.txt')).toBe(false);
  });

  it('picks unique names case-insensitively', async () => {
    const dir = createMemoryFs();
    await writeFile(dir, 'PEFS.pdf', 'x');
    await writeFile(dir, 'pefs (2).pdf', 'x');
    expect(await uniqueFileName(dir, 'pefs.pdf')).toBe('pefs (3).pdf');
    expect(await uniqueFileName(dir, 'other.pdf')).toBe('other.pdf');
  });

  it('sanitises file names', () => {
    expect(sanitizeFileName('IS-01: gas/liquid?')).toBe('IS-01_ gas_liquid_');
    expect(sanitizeFileName('CON')).toBe('file');
    expect(sanitizeFileName('  name.  ')).toBe('name');
  });
});

describe('atomic write (PRJ-04)', () => {
  it('renames the temporary file over the target when move() is available', async () => {
    const dir = createMemoryFs();
    await writeFile(dir, 'project.json', 'old');
    expect(await writeTextAtomic(dir, 'project.json', 'new')).toBe('move');
    expect(dir.textAt('project.json')).toBe('new');
    expect(dir.tree()).toEqual(['project.json']);
  });

  it('falls back to replace-then-delete without move()', async () => {
    const dir = createMemoryFs('w', { supportsMove: false });
    await writeFile(dir, 'project.json', 'old');
    expect(await writeTextAtomic(dir, 'project.json', 'new')).toBe('replace');
    expect(dir.textAt('project.json')).toBe('new');
    expect(dir.tree()).toEqual(['project.json']);
  });

  it('leaves the original intact when the temporary write fails', async () => {
    const dir = createMemoryFs();
    await writeFile(dir, 'project.json', 'old');
    dir.faults = { failCloseOf: 'project.json.tmp' };
    await expect(writeTextAtomic(dir, 'project.json', 'new')).rejects.toThrow();
    expect(dir.textAt('project.json')).toBe('old');
  });

  it('leaves a complete temporary file when the rename step fails', async () => {
    const dir = createMemoryFs('w', { supportsMove: false });
    await writeFile(dir, 'project.json', 'old');
    dir.faults = { failCloseOf: 'project.json' };
    await expect(writeTextAtomic(dir, 'project.json', 'new')).rejects.toThrow();
    expect(dir.textAt('project.json')).toBe('old');
    expect(dir.textAt('project.json.tmp')).toBe('new');
  });
});
