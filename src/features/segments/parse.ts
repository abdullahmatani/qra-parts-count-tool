/** Parses an optional number field: '' → null, otherwise a finite number or 'invalid'. */
export function parseOptionalNumber(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 'invalid';
}
