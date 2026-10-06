// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';
import {
  buildHelpIndex,
  makeSnippet,
  markRuns,
  matchStrength,
  queryWords,
  searchHelp,
  sectionsOf,
  tokenize,
  editDistance,
  type HelpDocument,
} from './search';

const doc = (id: string, source: string): HelpDocument => {
  const blocks = parseMarkdown(source);
  const title = blocks[0]!.type === 'heading' ? blocks[0]!.text : id;
  return { id, title, blocks };
};

const DOCS = [
  doc(
    'highlighting',
    [
      '# Highlighting and auto trace',
      '',
      'Highlighting shows the extent of each segment.',
      '',
      '## The Highlighter',
      '',
      'Pick the **Highlighter** and drag over the pipework.',
      '',
      '## Auto trace',
      '',
      'Auto trace highlights a segment for you, out to its ESDVs and end flanges.',
    ].join('\n'),
  ),
  doc(
    'segments',
    [
      '# Segments and ESDVs',
      '',
      'An isolatable segment is the inventory between ESD valves.',
      '',
      '## Mark ESDVs',
      '',
      'Select the **ESDV** tool and click each valve. The boundary rule decides which segment counts it.',
      '',
      '### Diamètre',
      '',
      'Sizes in DN are converted.',
    ].join('\n'),
  ),
  doc(
    'export',
    [
      '# Checking and exporting',
      '',
      '## The pre-export check',
      '',
      'Markers not in a segment are listed, and segment values in units the template cannot take. Export anyway records the accepted warnings.',
    ].join('\n'),
  ),
];

const index = buildHelpIndex(DOCS);
const top = (query: string) => {
  const hit = searchHelp(index, query).hits[0];
  return hit ? `${hit.section.articleId}#${hit.section.sectionId ?? ''}` : null;
};

describe('documentation sections', () => {
  it('cuts articles at ## and ### headings, with the introduction first', () => {
    expect(sectionsOf(DOCS[1]!).map((s) => [s.sectionId, s.heading, s.text.slice(0, 20)])).toEqual([
      [null, 'Segments and ESDVs', 'An isolatable segmen'],
      ['mark-esdvs', 'Mark ESDVs', 'Select the ESDV tool'],
      ['diamètre', 'Diamètre', 'Sizes in DN are conv'],
    ]);
  });
});

describe('words', () => {
  it('normalises case and accents', () => {
    expect(tokenize('Diamètre NOMINAL, DN50').map((t) => t.word)).toEqual([
      'diametre',
      'nominal',
      'dn50',
    ]);
  });

  it('drops common words unless nothing else is left', () => {
    expect(queryWords('How do I export the drawings?')).toEqual(['export', 'drawings']);
    expect(queryWords('how to')).toEqual(['how', 'to']);
  });

  it('matches whole words, starts of words and typos in longer words', () => {
    expect(matchStrength('trace', 'trace')).toBe(1);
    expect(matchStrength('tracing', 'trac')).toBeGreaterThan(0);
    expect(matchStrength('highlighter', 'hilighter')).toBeGreaterThan(0);
    expect(matchStrength('highlighter', 'higlight')).toBeGreaterThan(0);
    expect(matchStrength('esdv', 'esd')).toBeGreaterThan(0);
    expect(matchStrength('flange', 'flagne')).toBeGreaterThan(0);
    expect(matchStrength('pump', 'pimp')).toBe(0);
    expect(matchStrength('valve', 'flange')).toBe(0);
  });

  it('counts edits: insert, delete, change or swap, up to a limit', () => {
    expect(editDistance('flange', 'flanges', 2)).toBe(1);
    expect(editDistance('flange', 'flang', 2)).toBe(1);
    expect(editDistance('flange', 'flinge', 2)).toBe(1);
    expect(editDistance('flange', 'falnge', 2)).toBe(1);
    expect(editDistance('highlighter', 'hilighter', 2)).toBe(2);
    expect(editDistance('flange', 'fiange12', 2)).toBe(3);
    expect(editDistance('compressor', 'valve', 2)).toBe(3);
  });
});

describe('searching the documentation', () => {
  it('ranks the section whose heading matches first', () => {
    expect(top('auto trace')).toBe('highlighting#auto-trace');
    expect(top('esdv')).toBe('segments#mark-esdvs');
    expect(top('boundary rule')).toBe('segments#mark-esdvs');
  });

  it('finds words by their start, with typos and without accents', () => {
    expect(top('highl')).toBe('highlighting#the-highlighter');
    expect(top('hilighter')).toBe('highlighting#the-highlighter');
    expect(top('diametre')).toBe('segments#diamètre');
  });

  it('needs every word, and falls back to the sections with most of them', () => {
    const all = searchHelp(index, 'segment export');
    expect(all.hits.map((h) => h.section.articleId)).toEqual(['export']);
    expect(all.hits[0]!.complete).toBe(true);
    const some = searchHelp(index, 'export zebra');
    expect(some.hits.length).toBeGreaterThan(0);
    expect(some.hits.every((h) => !h.complete)).toBe(true);
    expect(searchHelp(index, 'zebra').hits).toEqual([]);
    expect(searchHelp(index, '   ').hits).toEqual([]);
  });

  it('only allows typos for words that are not found as typed', () => {
    // "valves" is in the documentation, so it does not also match "values" one edit away.
    expect(searchHelp(index, 'valves').terms.has('values')).toBe(false);
    expect([...searchHelp(index, 'pipewrok').terms]).toContain('pipework');
  });

  it('returns the matched words for marking the article', () => {
    const { terms } = searchHelp(index, 'trac');
    expect(terms.has('trace')).toBe(true);
  });
});

describe('snippets and marks', () => {
  it('cuts a snippet round the first match and marks every match in it', () => {
    const text = `${'Lead words before the match. '.repeat(6)}The ESDV is here, and another ESDV.`;
    const snippet = makeSnippet(text, new Set(['esdv']));
    expect(snippet.before).toBe(true);
    expect(snippet.marks).toHaveLength(2);
    for (const [start, end] of snippet.marks) {
      expect(snippet.text.slice(start, end)).toBe('ESDV');
    }
    expect(snippet.text.length).toBeLessThanOrEqual(180);
  });

  it('starts at the beginning when nothing in the body matches', () => {
    expect(makeSnippet('Short text.', new Set(['zebra']))).toEqual({
      text: 'Short text.',
      marks: [],
      before: false,
      after: false,
    });
  });

  it('splits text into marked and plain runs', () => {
    expect(markRuns('Mark ESDVs and esdv.', new Set(['esdv']))).toEqual([
      { text: 'Mark ESDVs and ', mark: false },
      { text: 'esdv', mark: true },
      { text: '.', mark: false },
    ]);
    expect(markRuns('No terms', new Set())).toEqual([{ text: 'No terms', mark: false }]);
  });
});
