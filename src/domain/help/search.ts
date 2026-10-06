/**
 * Full-text search over the built-in documentation. Every article is cut into
 * sections at its `##` and `###` headings, so a result leads to the place
 * that answers the question, not just to the article.
 *
 * Words are matched case- and accent-insensitively, as whole words, as the
 * start of a word (`trac` finds "trace" and "tracing"), and, when a word is
 * not in the documentation as typed, with a typo or two in longer words
 * (`hilighter` finds "highlighter"). Every word of the query must
 * match; common words such as "how" or "the" are left out. When nothing
 * matches every word, the sections that match most of them are offered.
 */
import { inlineText, type Block } from './markdown';

export interface HelpDocument {
  id: string;
  title: string;
  blocks: readonly Block[];
}

export interface HelpSection {
  articleId: string;
  articleTitle: string;
  /** Heading anchor, or null for the article's introduction. */
  sectionId: string | null;
  heading: string;
  /** Plain text of the section, without its heading. */
  text: string;
}

export interface HelpSnippet {
  text: string;
  /** Character ranges of `text` to mark as matches. */
  marks: [number, number][];
  /** Text was cut before / after the snippet. */
  before: boolean;
  after: boolean;
}

export interface HelpHit {
  section: HelpSection;
  score: number;
  /** Normalised index words that matched in this section. */
  terms: string[];
  snippet: HelpSnippet;
  /** Every word of the query matched. */
  complete: boolean;
}

export interface HelpSearchResult {
  hits: HelpHit[];
  /** Every index word that matched, for marking them in an article. */
  terms: Set<string>;
}

/** Title, heading or body: where in a section a word appears. */
type Field = 0 | 1 | 2;
const FIELD_WEIGHT: Record<Field, number> = { 0: 3, 1: 5, 2: 1 };

interface Posting {
  section: number;
  field: Field;
  count: number;
}

export interface HelpIndex {
  sections: HelpSection[];
  vocabulary: Map<string, Posting[]>;
}

const STOP_WORDS = new Set(
  (
    'a an and are as at be by can do does for from how i if in into is it its me my of on or ' +
    'so than that the then there these this to was what when where which who why will with ' +
    'you your'
  ).split(' '),
);

const WORD = /[\p{L}\p{N}]+/gu;

/** Lower case without accents, so `Diamètre` matches `diametre`. */
export function normalizeWord(word: string): string {
  return word.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export interface Token {
  word: string;
  start: number;
  end: number;
}

/** The words of a text, normalised, with where they are in it. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = normalizeWord(match[0]);
    if (word) tokens.push({ word, start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

/** The words of a query to search for: common words are dropped unless nothing else is left. */
export function queryWords(query: string): string[] {
  const words = [...new Set(tokenize(query).map((token) => token.word))];
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  return meaningful.length > 0 ? meaningful : words;
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return inlineText(block.inlines);
    case 'list':
      return block.items.map((item) => item.map(blockText).join('\n')).join('\n');
    case 'table':
      return [block.header, ...block.rows]
        .map((row) => row.map((cell) => inlineText(cell)).join(' · '))
        .join('\n');
    case 'code':
      return block.text;
    case 'quote':
      return block.children.map(blockText).join('\n');
    case 'rule':
      return '';
  }
}

/** Cuts an article into its introduction and its `##` and `###` sections. */
export function sectionsOf(doc: HelpDocument): HelpSection[] {
  const sections: HelpSection[] = [];
  let current: HelpSection = {
    articleId: doc.id,
    articleTitle: doc.title,
    sectionId: null,
    heading: doc.title,
    text: '',
  };
  const parts: string[] = [];
  const close = () => {
    current.text = parts.join('\n').trim();
    parts.length = 0;
    if (current.text || current.sectionId) sections.push(current);
  };
  for (const block of doc.blocks) {
    if (block.type === 'heading' && block.level === 1) continue;
    if (block.type === 'heading' && (block.level === 2 || block.level === 3)) {
      close();
      current = {
        articleId: doc.id,
        articleTitle: doc.title,
        sectionId: block.id,
        heading: block.text,
        text: '',
      };
      continue;
    }
    parts.push(blockText(block));
  }
  close();
  return sections;
}

function addWords(
  vocabulary: Map<string, Posting[]>,
  text: string,
  section: number,
  field: Field,
): void {
  const counts = new Map<string, number>();
  for (const { word } of tokenize(text)) counts.set(word, (counts.get(word) ?? 0) + 1);
  for (const [word, count] of counts) {
    const postings = vocabulary.get(word);
    const posting = { section, field, count };
    if (postings) postings.push(posting);
    else vocabulary.set(word, [posting]);
  }
}

export function buildHelpIndex(docs: readonly HelpDocument[]): HelpIndex {
  const sections = docs.flatMap(sectionsOf);
  const vocabulary = new Map<string, Posting[]>();
  sections.forEach((section, index) => {
    addWords(vocabulary, section.articleTitle, index, 0);
    if (section.sectionId) addWords(vocabulary, section.heading, index, 1);
    addWords(vocabulary, section.text, index, 2);
  });
  return { sections, vocabulary };
}

/**
 * Edits (insert, delete, change, or swap of two neighbours) between `a` and
 * `b`, counted up to `max`; anything over is returned as `max + 1`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2]! + 1);
      }
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    before = previous;
    previous = current;
  }
  return Math.min(previous[b.length]!, max + 1);
}

/** Typos allowed in a query word: none in short words, one from 5 letters, two from 8. */
function typosAllowed(word: string): number {
  return word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0;
}

/**
 * How well an index word matches a query word: 1 the whole word, 0.7 its
 * start, 0.4 with a typo, 0.3 its start with a typo (`higlight` for
 * "highlighter"); 0 not at all.
 */
export function matchStrength(indexWord: string, queryWord: string): number {
  if (indexWord === queryWord) return 1;
  if (indexWord.startsWith(queryWord)) return 0.7;
  const typos = typosAllowed(queryWord);
  if (typos === 0) return 0;
  if (editDistance(indexWord, queryWord, typos) <= typos) return 0.4;
  for (let length = queryWord.length - typos; length <= queryWord.length + typos; length++) {
    if (length <= 0 || length >= indexWord.length) continue;
    if (editDistance(indexWord.slice(0, length), queryWord, typos) <= typos) return 0.3;
  }
  return 0;
}

const SNIPPET_LENGTH = 180;
const SNIPPET_LEAD = 50;

/** A short extract of `text` round its first match, with the matches marked. */
export function makeSnippet(text: string, terms: ReadonlySet<string>): HelpSnippet {
  const flat = text.replace(/\s+/g, ' ');
  const tokens = tokenize(flat);
  const first = tokens.find((token) => terms.has(token.word));
  let start = first ? Math.max(0, first.start - SNIPPET_LEAD) : 0;
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    start = space >= 0 && space < (first?.start ?? flat.length) ? space + 1 : start;
  }
  let end = Math.min(flat.length, start + SNIPPET_LENGTH);
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    if (space > start + SNIPPET_LENGTH / 2) end = space;
  }
  const marks: [number, number][] = tokens
    .filter((token) => terms.has(token.word) && token.start >= start && token.end <= end)
    .map((token) => [token.start - start, token.end - start]);
  return { text: flat.slice(start, end), marks, before: start > 0, after: end < flat.length };
}

function phraseIn(text: string, words: readonly string[]): boolean {
  const tokens = tokenize(text).map((token) => token.word);
  outer: for (let i = 0; i + words.length <= tokens.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (matchStrength(tokens[i + j]!, words[j]!) === 0) continue outer;
    }
    return true;
  }
  return false;
}

export function searchHelp(
  index: HelpIndex,
  query: string,
  { limit = 40 }: { limit?: number } = {},
): HelpSearchResult {
  const words = queryWords(query);
  if (words.length === 0) return { hits: [], terms: new Set() };

  // For each query word, the index words it matches and how well. Typos are
  // only allowed for a word that is not in the documentation as typed.
  const matches = words.map((word) => {
    const found: [string, number][] = [];
    const typos: [string, number][] = [];
    for (const indexWord of index.vocabulary.keys()) {
      const strength = matchStrength(indexWord, word);
      if (strength >= 0.7) found.push([indexWord, strength]);
      else if (strength > 0) typos.push([indexWord, strength]);
    }
    return found.length > 0 ? found : typos;
  });

  interface Candidate {
    perWord: number[];
    terms: Set<string>;
  }
  const candidates = new Map<number, Candidate>();
  matches.forEach((found, w) => {
    // Per section and field, the best match of this query word.
    const best = new Map<number, number[]>();
    for (const [indexWord, strength] of found) {
      for (const posting of index.vocabulary.get(indexWord)!) {
        const score =
          strength * FIELD_WEIGHT[posting.field] * (1 + Math.log(Math.min(posting.count, 20)));
        const fields = best.get(posting.section) ?? [0, 0, 0];
        fields[posting.field] = Math.max(fields[posting.field]!, score);
        best.set(posting.section, fields);
        let candidate = candidates.get(posting.section);
        if (!candidate) {
          candidate = { perWord: words.map(() => 0), terms: new Set() };
          candidates.set(posting.section, candidate);
        }
        candidate.terms.add(indexWord);
      }
    }
    for (const [section, fields] of best) {
      candidates.get(section)!.perWord[w] = fields[0]! + fields[1]! + fields[2]!;
    }
  });

  const scored = [...candidates].map(([sectionIndex, candidate]) => {
    const section = index.sections[sectionIndex]!;
    const matched = candidate.perWord.filter((score) => score > 0).length;
    let score = candidate.perWord.reduce((sum, value) => sum + value, 0);
    if (words.length > 1 && (phraseIn(section.heading, words) || phraseIn(section.text, words))) {
      score *= 1.5;
    }
    return { section, score, matched, terms: candidate.terms };
  });

  const complete = scored.filter((hit) => hit.matched === words.length);
  const pool = complete.length > 0 ? complete : scored;
  pool.sort((a, b) => b.matched - a.matched || b.score - a.score);

  const terms = new Set<string>();
  const hits = pool.slice(0, limit).map((hit) => {
    for (const term of hit.terms) terms.add(term);
    return {
      section: hit.section,
      score: hit.score,
      terms: [...hit.terms],
      snippet: makeSnippet(hit.section.text, hit.terms),
      complete: hit.matched === words.length,
    };
  });
  return { hits, terms };
}

/** Splits text into runs, marking the words in `terms`, for highlighting matches in an article. */
export function markRuns(
  text: string,
  terms: ReadonlySet<string>,
): { text: string; mark: boolean }[] {
  if (terms.size === 0) return [{ text, mark: false }];
  const runs: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const token of tokenize(text)) {
    if (!terms.has(token.word)) continue;
    if (token.start > at) runs.push({ text: text.slice(at, token.start), mark: false });
    runs.push({ text: text.slice(token.start, token.end), mark: true });
    at = token.end;
  }
  if (at < text.length) runs.push({ text: text.slice(at), mark: false });
  return runs;
}
