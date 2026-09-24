/**
 * Technical text (size bins such as `6" < x ≤ 11"`, coordinates, tags) must
 * read left to right inside a right-to-left interface (NFR-08): otherwise the
 * bidi algorithm reorders its parts and mirrors `<` into `>`. In right-to-left
 * text this wraps it in a left-to-right isolate; left-to-right text is left as is.
 */
export function ltr(text: string, dir: string): string {
  return dir === 'rtl' ? `⁦${text}⁩` : text;
}
