/**
 * AutoCAD text control codes: `%%` codes in TEXT and the inline formatting
 * codes of MTEXT. Formatting is dropped; the characters are kept.
 */

/** Decodes %%c (Ø), %%d (°), %%p (±), %%nnn and removes %%u/%%o toggles. */
export function decodePercentCodes(text: string): string {
  return text.replace(/%%(c|d|p|u|o|%|\d{3})/gi, (_, code: string) => {
    switch (code.toLowerCase()) {
      case 'c':
        return 'Ø';
      case 'd':
        return '°';
      case 'p':
        return '±';
      case '%':
        return '%';
      case 'u':
      case 'o':
        return '';
      default:
        return String.fromCharCode(Number(code));
    }
  });
}

export function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\U\+([0-9a-f]{4})/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Converts MTEXT content to plain lines: removes font, height, colour and
 * other formatting codes, turns \P into line breaks and stacked fractions
 * (\S1^2;) into "1/2".
 */
export function mtextToLines(raw: string): string[] {
  let text = decodeUnicodeEscapes(raw);
  // Stacked text: \S1^2; \S1/2; \S1#2;
  text = text.replace(/\\S([^;]*?)[\^/#]([^;]*?);/g, '$1/$2');
  // Codes with an argument terminated by ';'.
  text = text.replace(/\\[ACFHQTWfhpqtwac][^;\\]*;/g, '');
  // Paragraph and line breaks.
  text = text.replace(/\\P|\\n/g, '\n');
  // Non-breaking space.
  text = text.replace(/\\~/g, ' ');
  // Simple toggles: underline, overline, strike-through, and \X.
  text = text.replace(/\\[LlOoKkX]/g, '');
  // Escaped characters: protect \\, \{ and \} while grouping braces are removed.
  const placeholders: Record<string, string> = { '\\': '\ue000', '{': '\ue001', '}': '\ue002' };
  text = text.replace(/\\([\\{}])/g, (_, ch: string) => placeholders[ch] ?? ch);
  text = text.replace(/[{}]/g, '');
  text = text
    .replace(/\ue000/g, '\\')
    .replace(/\ue001/g, '{')
    .replace(/\ue002/g, '}');
  return decodePercentCodes(text)
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
}
