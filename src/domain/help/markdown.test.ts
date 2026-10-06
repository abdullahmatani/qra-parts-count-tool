// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createSlugger,
  inlineText,
  parseInline,
  parseMarkdown,
  slugify,
  type Block,
} from './markdown';

describe('heading anchors', () => {
  it('follows GitHub: lower case, punctuation dropped, spaces as dashes', () => {
    expect(slugify('Mark ESDVs')).toBe('mark-esdvs');
    expect(slugify('P&ID, PEFS')).toBe('pid-pefs');
    expect(slugify('Does any of my data leave the computer?')).toBe(
      'does-any-of-my-data-leave-the-computer',
    );
    expect(slugify('Boundary rule (ESDV)')).toBe('boundary-rule-esdv');
    expect(slugify('Split, merge, reorder')).toBe('split-merge-reorder');
    expect(slugify('DN')).toBe('dn');
  });

  it('numbers repeated headings', () => {
    const slug = createSlugger();
    expect([slug('Notes'), slug('Notes'), slug('Notes'), slug('Notes-1')]).toEqual([
      'notes',
      'notes-1',
      'notes-2',
      'notes-1-1',
    ]);
  });
});

describe('inline Markdown', () => {
  it('reads bold, italic, code and links', () => {
    expect(parseInline('Click **Export**, then *wait* for `export_log.json`.')).toEqual([
      { type: 'text', text: 'Click ' },
      { type: 'strong', children: [{ type: 'text', text: 'Export' }] },
      { type: 'text', text: ', then ' },
      { type: 'em', children: [{ type: 'text', text: 'wait' }] },
      { type: 'text', text: ' for ' },
      { type: 'code', text: 'export_log.json' },
      { type: 'text', text: '.' },
    ]);
    expect(parseInline('See [Counting **parts**](counting.md#warnings).')).toEqual([
      { type: 'text', text: 'See ' },
      {
        type: 'link',
        href: 'counting.md#warnings',
        children: [
          { type: 'text', text: 'Counting ' },
          { type: 'strong', children: [{ type: 'text', text: 'parts' }] },
        ],
      },
      { type: 'text', text: '.' },
    ]);
  });

  it('joins lines with spaces and keeps bold across a line break', () => {
    expect(inlineText(parseInline('**Settings ›\nGeneral**'))).toBe('Settings › General');
    expect(parseInline('**Settings ›\nGeneral**')[0]!.type).toBe('strong');
  });

  it('leaves unmatched markers, underscores in words and escapes as text', () => {
    expect(parseInline('snake_case_name and 2 * 3')).toEqual([
      { type: 'text', text: 'snake_case_name and 2 * 3' },
    ]);
    expect(parseInline('\\*not italic\\*')).toEqual([{ type: 'text', text: '*not italic*' }]);
    expect(parseInline('a ** b')).toEqual([{ type: 'text', text: 'a ** b' }]);
  });

  it('keeps markers inside code spans literal', () => {
    expect(parseInline('`{project}_{drawingNo}` and `**x**`')).toEqual([
      { type: 'code', text: '{project}_{drawingNo}' },
      { type: 'text', text: ' and ' },
      { type: 'code', text: '**x**' },
    ]);
  });

  it('never reads HTML: tags stay text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { type: 'text', text: '<script>alert(1)</script>' },
    ]);
  });

  it('reads autolinks', () => {
    expect(parseInline('<https://example.com/a>')).toEqual([
      {
        type: 'link',
        href: 'https://example.com/a',
        children: [{ type: 'text', text: 'https://example.com/a' }],
      },
    ]);
  });
});

describe('block Markdown', () => {
  it('reads headings, paragraphs, rules and fenced code', () => {
    const blocks = parseMarkdown(
      '# Title\n\nFirst line\nsecond line.\n\n---\n\n```text\n<dir>/\n├── a\n```\n\n## Notes ##\n',
    );
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'rule', 'code', 'heading']);
    expect(blocks[0]).toMatchObject({ level: 1, id: 'title', text: 'Title' });
    expect(inlineText((blocks[1] as Extract<Block, { type: 'paragraph' }>).inlines)).toBe(
      'First line second line.',
    );
    expect(blocks[3]).toEqual({ type: 'code', lang: 'text', text: '<dir>/\n├── a' });
    expect(blocks[4]).toMatchObject({ level: 2, id: 'notes', text: 'Notes' });
  });

  it('reads ordered and bullet lists, nested and with continuation lines', () => {
    const [list] = parseMarkdown(
      [
        '3. First item',
        '   carries on here.',
        '4. Second item:',
        '',
        '   - nested one',
        '   - nested two',
        '',
        '   A second paragraph.',
        '5. Third item with a lazy',
        'continuation line.',
      ].join('\n'),
    ) as [Extract<Block, { type: 'list' }>];
    expect(list).toMatchObject({ type: 'list', ordered: true, start: 3 });
    expect(list.items).toHaveLength(3);
    const [first, second, third] = list.items;
    expect(inlineText((first![0] as Extract<Block, { type: 'paragraph' }>).inlines)).toBe(
      'First item carries on here.',
    );
    expect(second!.map((b) => b.type)).toEqual(['paragraph', 'list', 'paragraph']);
    expect((second![1] as Extract<Block, { type: 'list' }>).items).toHaveLength(2);
    expect(inlineText((third![0] as Extract<Block, { type: 'paragraph' }>).inlines)).toBe(
      'Third item with a lazy continuation line.',
    );
  });

  it('ends a list at a paragraph and starts a new one for another marker', () => {
    const blocks = parseMarkdown('- a\n- b\n\nAfter.\n\n1. one\n');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'paragraph', 'list']);
    expect((blocks[2] as Extract<Block, { type: 'list' }>).ordered).toBe(true);
  });

  it('reads pipe tables with alignment, escaped pipes and code', () => {
    const [table] = parseMarkdown(
      '| Key | Action |\n| :-- | --: |\n| `a|b` | Pipe \\| here |\n| `F1` |\n',
    ) as [Extract<Block, { type: 'table' }>];
    expect(table.type).toBe('table');
    expect(table.align).toEqual(['left', 'right']);
    expect(table.header.map((cell) => inlineText(cell))).toEqual(['Key', 'Action']);
    expect(table.rows.map((row) => row.map((cell) => inlineText(cell)))).toEqual([
      ['a|b', 'Pipe | here'],
      ['F1', ''],
    ]);
  });

  it('reads a table inside a list item', () => {
    const [list] = parseMarkdown(
      '1. Choose:\n\n   | A | B |\n   | - | - |\n   | 1 | 2 |\n\n2. Next\n',
    ) as [Extract<Block, { type: 'list' }>];
    expect(list.items).toHaveLength(2);
    expect(list.items[0]!.map((b) => b.type)).toEqual(['paragraph', 'table']);
  });

  it('reads block quotes', () => {
    const [quote] = parseMarkdown('> Quoted **text**\n> more\n') as [
      Extract<Block, { type: 'quote' }>,
    ];
    expect(quote.type).toBe('quote');
    expect(quote.children).toHaveLength(1);
  });

  it('gives repeated headings unique anchors', () => {
    const headings = parseMarkdown('## Help\n\n## Help\n').filter((b) => b.type === 'heading');
    expect(headings.map((h) => (h as Extract<Block, { type: 'heading' }>).id)).toEqual([
      'help',
      'help-1',
    ]);
  });
});
