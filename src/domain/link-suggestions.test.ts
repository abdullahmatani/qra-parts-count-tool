import { describe, expect, it } from 'vitest';
import { makeDrawing } from '@/test/fixtures';
import { suggestLinks } from './link-suggestions';
import type { TextBox } from './text-search';

const box = (text: string, x: number, y: number): TextBox => ({
  text,
  x,
  y,
  width: text.length * 5,
  height: 8,
});

describe('link suggestions (LNK-06)', () => {
  const a = makeDrawing({ id: 'drw_a', drawingNo: 'PEFS-1001' });
  const b = makeDrawing({ id: 'drw_b', drawingNo: 'PEFS-1002' });
  const c = makeDrawing({ id: 'drw_c', drawingNo: 'PEFS-10021' });
  const short = makeDrawing({ id: 'drw_s', drawingNo: 'P1' });

  it('suggests a link where a drawing names another', () => {
    const text = new Map([
      [
        'drw_a',
        [
          box('TO PEFS-1002', 900, 150), // off-page connector
          box('PEFS-1001', 1000, 800), // its own title block
          box('P1', 100, 100), // too short to trust
        ],
      ],
      ['drw_b', [box('FROM PEFS', 20, 300), box('-1001', 68, 300)]], // split across runs
    ]);
    const suggestions = suggestLinks([a, b, c, short], text, []);
    expect(suggestions.map((s) => [s.sourceDrawingId, s.targetDrawingId, s.text])).toEqual([
      ['drw_a', 'drw_b', 'TO PEFS-1002'],
      ['drw_b', 'drw_a', 'FROM PEFS-1001'],
    ]);
    // The hotspot covers the text with a margin.
    expect(suggestions[0]!.rect.x).toBeLessThan(900);
    expect(suggestions[0]!.rect.width).toBeGreaterThan(60);
  });

  it('matches whole numbers and prefers the longest', () => {
    const text = new Map([['drw_a', [box('SEE PEFS-10021', 10, 10)]]]);
    expect(suggestLinks([a, b, c], text, []).map((s) => s.targetDrawingId)).toEqual(['drw_c']);
    const noSuch = new Map([['drw_a', [box('SEE PEFS-100299', 10, 10)]]]);
    expect(suggestLinks([a, b], noSuch, [])).toEqual([]);
  });

  it('skips text an existing link already covers', () => {
    const text = new Map([['drw_a', [box('TO PEFS-1002', 900, 150)]]]);
    const link = {
      id: 'lnk_1',
      sourceDrawingId: 'drw_a',
      rect: { x: 890, y: 140, width: 100, height: 30 },
      targetDrawingId: 'drw_b',
      targetView: null,
      label: '',
    };
    expect(suggestLinks([a, b], text, [link])).toEqual([]);
  });
});
