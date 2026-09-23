import { describe, expect, it } from 'vitest';
import { createMemoryFs } from '@/test/memory-fs';
import { PREVIEW_CACHE_DIR, previewCachePath, readCachedPreview } from './preview-cache';

const pdf = { fileHash: 'abc123', fileType: 'pdf', page: 2, layout: null } as const;
const dwg = { fileHash: 'def456', fileType: 'dwg', page: null, layout: 'Sheet 1/A' } as const;

describe('previewCachePath', () => {
  it('keys PDF previews by file hash, page and size', () => {
    expect(previewCachePath(pdf, 2048)).toBe(`${PREVIEW_CACHE_DIR}/abc123-p2-2048-v1.png`);
    expect(previewCachePath({ ...pdf, page: null }, 2048)).toContain('-p1-');
  });

  it('keys CAD previews by layout and colour mode with a file-name-safe key', () => {
    const mono = previewCachePath(dwg, 2048, 'monochrome');
    const color = previewCachePath(dwg, 2048, 'color');
    expect(mono).not.toBe(color);
    expect(mono).toMatch(/^cache\/previews\/def456-l-Sheet_1_A-[a-z0-9]+-monochrome-2048-v1\.png$/);
    // Names that sanitise to the same text still get different keys.
    expect(previewCachePath({ ...dwg, layout: 'Sheet 1:A' }, 2048)).not.toBe(
      previewCachePath(dwg, 2048),
    );
  });
});

describe('readCachedPreview', () => {
  it('returns null when nothing is cached', async () => {
    const dir = createMemoryFs();
    await expect(readCachedPreview(dir, previewCachePath(pdf, 2048))).resolves.toBeNull();
  });
});
