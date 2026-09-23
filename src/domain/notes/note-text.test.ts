import { describe, expect, it } from 'vitest';
import { applyFormat, noteToPlainText, parseInline, parseNote } from './note-text';

describe('note formatting (NTE-01)', () => {
  it('reads bold runs and leaves unmatched markers alone', () => {
    expect(parseInline('Flanges are **ANSI 300** here')).toEqual([
      { text: 'Flanges are ', bold: false },
      { text: 'ANSI 300', bold: true },
      { text: ' here', bold: false },
    ]);
    expect(parseInline('2 ** 3')).toEqual([{ text: '2 ** 3', bold: false }]);
  });

  it('splits paragraphs and bullet lists', () => {
    const blocks = parseNote('Assumptions:\nline two\n\n- first\n* **second**\n\nEnd');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'paragraph']);
    expect(blocks[0]).toMatchObject({
      lines: [[{ text: 'Assumptions:' }], [{ text: 'line two' }]],
    });
    expect(blocks[1]).toMatchObject({
      items: [[{ text: 'first' }], [{ text: 'second', bold: true }]],
    });
  });

  it('never interprets HTML', () => {
    expect(parseNote('<b>x</b>')).toEqual([
      { kind: 'paragraph', lines: [[{ text: '<b>x</b>', bold: false }]] },
    ]);
  });

  it('gives plain text for Excel (NTE-03)', () => {
    expect(noteToPlainText('**Scope**\n- valves\n- flanges\r\n\r\nDone')).toBe(
      'Scope\n\n• valves\n• flanges\n\nDone',
    );
  });

  it('applies bold and bullets to a selection', () => {
    expect(applyFormat('make this bold', 5, 9, 'bold')).toEqual({
      text: 'make **this** bold',
      start: 7,
      end: 11,
    });
    expect(applyFormat('', 0, 0, 'bold').text).toBe('**bold text**');
    const bullets = applyFormat('a\nb\nc', 2, 3, 'bullet');
    expect(bullets.text).toBe('a\n- b\nc');
    expect(applyFormat(bullets.text, 2, 5, 'bullet').text).toBe('a\nb\nc');
  });
});
