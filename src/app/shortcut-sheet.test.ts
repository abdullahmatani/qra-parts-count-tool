// @vitest-environment node
/** Keeps docs/keyboard-shortcuts.md in step with the tools and the starter library (ANN-08). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { starterLibrary } from '@/domain/count/starter-library';
import { TOOLS } from './tools';

const sheet = readFileSync(new URL('../../docs/keyboard-shortcuts.md', import.meta.url), 'utf8');
const rows = sheet.split('\n').filter((line) => line.startsWith('| `'));

describe('keyboard shortcut sheet', () => {
  it('lists every markup tool key', () => {
    for (const tool of TOOLS) {
      expect(rows.some((row) => row.startsWith(`| \`${tool.shortcut}\` |`))).toBe(true);
    }
  });

  it('lists the starter library type keys', () => {
    for (const type of starterLibrary().equipmentTypes.filter((t) => t.shortcut)) {
      const row = rows.find((r) => r.startsWith(`| \`${type.shortcut}\` |`));
      expect(row, type.name).toContain(type.name);
    }
  });
});
