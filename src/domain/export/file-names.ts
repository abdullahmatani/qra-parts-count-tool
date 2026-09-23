/**
 * Export file names (EXP-05): the project's pattern with {project},
 * {segment}, {drawingNo}, {rev}, {sheet}, {title} and {page} filled in, made
 * safe for every file system and unique within the export folder.
 */
export type NameValues = Partial<
  Record<'project' | 'segment' | 'drawingNo' | 'rev' | 'sheet' | 'title' | 'page', string>
>;

export const NAME_TOKENS = ['project', 'segment', 'drawingNo', 'rev', 'sheet', 'title', 'page'];

function safe(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/^[_ .-]+|[_ .-]+$/g, '')
    .slice(0, 150);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) ? `${cleaned}_` : cleaned;
}

/** Fills the pattern; empty values leave no stray separators behind. */
export function formatExportName(pattern: string, values: NameValues): string {
  const filled = pattern.replace(/\{(\w+)\}/g, (match, key: string) =>
    NAME_TOKENS.includes(key) ? (values[key as keyof NameValues] ?? '').trim() : match,
  );
  // "PEFS-001__annotated" (empty revision) → "PEFS-001_annotated".
  const tidied = filled.replace(/([_-])[_-]+/g, '$1').replace(/^[_-]+|[_-]+$/g, '');
  return safe(tidied) || 'drawing';
}

/** Adds (2), (3)… before the extension until the name is unused. */
export function uniqueName(name: string, extension: string, taken: Set<string>): string {
  let candidate = `${name}${extension}`;
  for (let i = 2; taken.has(candidate.toLowerCase()); i += 1) {
    candidate = `${name} (${i})${extension}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}
