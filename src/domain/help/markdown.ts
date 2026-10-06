/**
 * A small Markdown reader for the built-in documentation (docs/help/*.md).
 *
 * It reads the subset the articles use: ATX headings, paragraphs, ordered and
 * bullet lists (nested by indentation), pipe tables, fenced code, block quotes
 * and rules; inline code, bold, italic and links. The result is a tree of plain
 * objects that the help viewer renders as React elements, so no HTML from the
 * text is ever interpreted: a tag in the text is shown as text.
 *
 * Heading ids follow GitHub's anchors, so links such as
 * `segments.md#mark-esdvs` work both on GitHub and in the app.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Align = 'left' | 'center' | 'right' | null;

export type Block =
  | { type: 'heading'; level: number; id: string; text: string; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'rule' };

/** GitHub's heading anchor: lower case, punctuation dropped, spaces as dashes. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/** Slugs that stay unique within one document (`notes`, `notes-1`, …), as on GitHub. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugify(text);
    let slug = base;
    while (seen.has(slug)) {
      const next = seen.get(base)! + 1;
      seen.set(base, next);
      slug = `${base}-${next}`;
    }
    seen.set(slug, 0);
    return slug;
  };
}

/** The text of inline content, without its formatting. */
export function inlineText(inlines: readonly Inline[]): string {
  return inlines
    .map((node) =>
      node.type === 'text' || node.type === 'code' ? node.text : inlineText(node.children),
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Inline content

const PUNCTUATION = /[!-/:-@[-`{-~]/;

function findClosingBacktickRun(text: string, from: number, length: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] !== '`') {
      i++;
      continue;
    }
    let run = 0;
    while (text[i + run] === '`') run++;
    if (run === length) return i;
    i += run;
  }
  return -1;
}

/** Index of the `]` that closes the `[` at `open`, or -1. */
function findClosingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
    } else if (ch === '`') {
      let run = 0;
      while (text[i + run] === '`') run++;
      const close = findClosingBacktickRun(text, i + run, run);
      if (close >= 0) i = close + run - 1;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the closing delimiter of an emphasis run that opens at `from`, or -1. */
function findClosingDelimiter(text: string, from: number, delimiter: string): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      let run = 0;
      while (text[i + run] === '`') run++;
      const close = findClosingBacktickRun(text, i + run, run);
      i = close >= 0 ? close + run : i + run;
      continue;
    }
    if (text.startsWith(delimiter, i)) {
      // `**` inside `*…*` is bold, not the end of the italic text.
      if (delimiter.length === 1 && text[i + 1] === delimiter) {
        const inner = findClosingDelimiter(text, i + 2, delimiter + delimiter);
        if (inner >= 0) {
          i = inner + 2;
          continue;
        }
      }
      const before = text[i - 1] ?? ' ';
      const after = text[i + delimiter.length] ?? ' ';
      const intraword = delimiter[0] === '_' && /[\p{L}\p{N}]/u.test(after);
      if (i > from && !/\s/.test(before) && !intraword) return i;
    }
    i++;
  }
  return -1;
}

/** Parses inline Markdown: code spans, bold, italic, links and escapes. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  // Line breaks inside a paragraph are spaces.
  const s = source.replace(/[ \t]*\n[ \t]*/g, ' ');
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '\\' && i + 1 < s.length && PUNCTUATION.test(s[i + 1]!)) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      let run = 0;
      while (s[i + run] === '`') run++;
      const close = findClosingBacktickRun(s, i + run, run);
      if (close >= 0) {
        flush();
        let code = s.slice(i + run, close);
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
        out.push({ type: 'code', text: code });
        i = close + run;
        continue;
      }
      text += '`'.repeat(run);
      i += run;
      continue;
    }
    if (ch === '*' || ch === '_') {
      const double = s[i + 1] === ch;
      const delimiter = double ? ch + ch : ch;
      const after = s[i + delimiter.length] ?? ' ';
      const before = s[i - 1] ?? ' ';
      const canOpen = !/\s/.test(after) && !(ch === '_' && /[\p{L}\p{N}]/u.test(before));
      if (canOpen) {
        const close = findClosingDelimiter(s, i + delimiter.length, delimiter);
        if (close >= 0) {
          flush();
          const children = parseInline(s.slice(i + delimiter.length, close));
          out.push(double ? { type: 'strong', children } : { type: 'em', children });
          i = close + delimiter.length;
          continue;
        }
      }
      text += delimiter;
      i += delimiter.length;
      continue;
    }
    if (ch === '[') {
      const close = findClosingBracket(s, i);
      if (close >= 0 && s[close + 1] === '(') {
        const end = s.indexOf(')', close + 2);
        if (end >= 0) {
          const target = s
            .slice(close + 2, end)
            .trim()
            .replace(/\s+"[^"]*"$/, '');
          flush();
          out.push({
            type: 'link',
            href: target.replace(/^<|>$/g, ''),
            children: parseInline(s.slice(i + 1, close)),
          });
          i = end + 1;
          continue;
        }
      }
    }
    if (ch === '<') {
      const auto = /^<(https?:\/\/[^\s<>]+)>/.exec(s.slice(i));
      if (auto) {
        flush();
        out.push({ type: 'link', href: auto[1]!, children: [{ type: 'text', text: auto[1]! }] });
        i += auto[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Blocks

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const TABLE_DELIMITER = /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;

const isBlank = (line: string) => line.trim() === '';
const indentOf = (line: string) => line.length - line.trimStart().length;

function isTableStart(lines: readonly string[], i: number): boolean {
  const line = lines[i]!;
  const next = lines[i + 1];
  return (
    line.includes('|') && next !== undefined && TABLE_DELIMITER.test(next) && next.includes('-')
  );
}

/** Whether a line starts a block other than a paragraph (so it ends a paragraph). */
function startsBlock(lines: readonly string[], i: number): boolean {
  const line = lines[i]!;
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    isTableStart(lines, i)
  );
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      cell += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

interface ListMarker {
  indent: number;
  ordered: boolean;
  bullet: string;
  start: number;
  /** Columns before the item's content. */
  contentIndent: number;
  content: string;
}

function listMarker(line: string): ListMarker | null {
  const match = LIST_ITEM.exec(line);
  if (!match) return null;
  const [, spaces, marker, gap, content] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  const ordered = /\d/.test(marker);
  const width = gap.length === 0 || gap.length > 4 ? 1 : gap.length;
  return {
    indent: spaces.length,
    ordered,
    bullet: ordered ? marker.slice(-1) : marker,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    contentIndent: spaces.length + marker.length + width,
    content: gap.length > 4 ? ' '.repeat(gap.length - 1) + content : content,
  };
}

function sameList(a: ListMarker, b: ListMarker): boolean {
  return a.ordered === b.ordered && a.bullet === b.bullet;
}

function parseLines(lines: readonly string[], slug: (text: string) => string): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const indent = indentOf(line);
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(marker)) {
        body.push(lines[i]!.slice(Math.min(indent, indentOf(lines[i]!))));
        i++;
      }
      i++; // the closing fence
      blocks.push({ type: 'code', lang: fence[2] ?? '', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const inlines = parseInline(heading[2] ?? '');
      const text = inlineText(inlines);
      blocks.push({ type: 'heading', level: heading[1]!.length, id: slug(text), text, inlines });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]!).map(alignOf);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && !isBlank(lines[i]!) && lines[i]!.includes('|')) {
        const cells = splitRow(lines[i]!);
        rows.push(header.map((_, c) => parseInline(cells[c] ?? '')));
        i++;
      }
      blocks.push({ type: 'table', align, header: header.map((cell) => parseInline(cell)), rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && !isBlank(lines[i]!)) {
        const current = lines[i]!;
        if (QUOTE.test(current)) body.push(current.replace(/^ {0,3}> ?/, ''));
        else if (startsBlock(lines, i)) break;
        else body.push(current);
        i++;
      }
      blocks.push({ type: 'quote', children: parseLines(body, slug) });
      continue;
    }

    const first = listMarker(line);
    if (first) {
      const items: Block[][] = [];
      let marker: ListMarker | null = first;
      while (marker && sameList(first, marker) && marker.indent < first.contentIndent) {
        const body = [marker.content];
        const contentIndent = marker.contentIndent;
        i++;
        marker = null;
        while (i < lines.length) {
          const current = lines[i]!;
          if (isBlank(current)) {
            // A blank line continues the item only if indented content follows.
            let next = i + 1;
            while (next < lines.length && isBlank(lines[next]!)) next++;
            if (next < lines.length && indentOf(lines[next]!) >= contentIndent) {
              for (; i < next; i++) body.push('');
              continue;
            }
            const following = next < lines.length ? listMarker(lines[next]!) : null;
            if (following && sameList(first, following) && following.indent < contentIndent) {
              i = next;
              marker = following;
            }
            break;
          }
          if (indentOf(current) >= contentIndent) {
            body.push(current.slice(contentIndent));
            i++;
            continue;
          }
          const next = listMarker(current);
          if (next) {
            if (sameList(first, next) && next.indent < contentIndent) marker = next;
            break;
          }
          // A lazy continuation of the item's last paragraph.
          if (!isBlank(body[body.length - 1]!) && !startsBlock(lines, i)) {
            body.push(current.trimStart());
            i++;
            continue;
          }
          break;
        }
        items.push(parseLines(body, slug));
      }
      blocks.push({ type: 'list', ordered: first.ordered, start: first.start, items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]!) && !startsBlock(lines, i)) {
      paragraph.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
  }
  return blocks;
}

/** Parses a Markdown document into blocks; heading ids are unique within it. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseLines(lines, createSlugger());
}
