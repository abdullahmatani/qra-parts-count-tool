import { describe, expect, it } from 'vitest';
import { entityTypeName, missingLines } from './missing-content';

describe('missing CAD content wording (DRW-02)', () => {
  it('names known entity types and keeps unknown ones as they are', () => {
    expect(entityTypeName('MULTILEADER')).toBe('Multileader');
    expect(entityTypeName('POLYLINE (mesh)')).toBe('Polygon mesh');
    expect(entityTypeName('ACPPASSET')).toBe('ACPPASSET');
  });

  it('lists entities, most first, then external references and blocks', () => {
    expect(
      missingLines({
        entities: { TRACE: 1, MULTILEADER: 3, ACPPASSET: 1 },
        xrefs: ['BORDER'],
        blocks: ['GONE'],
      }),
    ).toEqual([
      { text: '3 × Multileader', type: 'MULTILEADER' },
      { text: '1 × ACPPASSET', type: 'ACPPASSET' },
      { text: '1 × Trace', type: 'TRACE' },
      { text: 'External reference BORDER: a separate drawing file, not part of this one' },
      { text: 'Block GONE: used on the drawing but not defined in the file' },
    ]);
  });
});
