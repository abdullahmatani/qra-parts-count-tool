/**
 * Note formatting (NTE-01): a deliberately small Markdown subset, so notes stay
 * plain text in the project file and in Excel. Paragraphs are separated by a
 * blank line, lines starting with "- " or "* " are bullets, and **text** is bold.
 * Nothing else is interpreted, so no HTML ever reaches the page.
 */

export type Inline = { text: string; bold: boolean };

export type NoteBlock =
  { kind: 'paragraph'; lines: Inline[][] } | { kind: 'list'; items: Inline[][] };

/** Splits a line into plain and **bold** runs. Unmatched ** stays literal. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
    out.push({ text: m[1]!, bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}

const BULLET = /^\s*[-*]\s+/;

export function parseNote(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let current: NoteBlock | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) {
      current = null;
      continue;
    }
    if (BULLET.test(raw)) {
      const item = parseInline(raw.replace(BULLET, ''));
      if (current?.kind === 'list') current.items.push(item);
      else {
        current = { kind: 'list', items: [item] };
        blocks.push(current);
      }
    } else {
      const line = parseInline(raw.trim());
      if (current?.kind === 'paragraph') current.lines.push(line);
      else {
        current = { kind: 'paragraph', lines: [line] };
        blocks.push(current);
      }
    }
  }
  return blocks;
}

/** NTE-03: the note as plain text for Excel: bold markers removed, bullets as "• ". */
export function noteToPlainText(text: string): string {
  return parseNote(text)
    .map((block) =>
      block.kind === 'paragraph'
        ? block.lines.map((line) => line.map((run) => run.text).join('')).join('\n')
        : block.items.map((item) => `• ${item.map((run) => run.text).join('')}`).join('\n'),
    )
    .join('\n\n');
}

/**
 * Wraps the selected text in ** for bold, or adds "- " to the selected lines.
 * Returns the new text and selection, for the note editor's toolbar.
 */
export function applyFormat(
  text: string,
  start: number,
  end: number,
  format: 'bold' | 'bullet',
): { text: string; start: number; end: number } {
  if (format === 'bold') {
    const selected = text.slice(start, end) || 'bold text';
    const next = `${text.slice(0, start)}**${selected}**${text.slice(end)}`;
    return { text: next, start: start + 2, end: start + 2 + selected.length };
  }
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const allBullets = lines.every((line) => BULLET.test(line));
  const changed = lines.map((line) => (allBullets ? line.replace(BULLET, '') : `- ${line}`));
  const block = changed.join('\n');
  return {
    text: text.slice(0, lineStart) + block + text.slice(lineEnd),
    start: lineStart,
    end: lineStart + block.length,
  };
}
