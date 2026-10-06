/**
 * The articles of the built-in documentation, in reading order. Each is a
 * Markdown file in docs/help/ named after its id; the content is loaded with
 * the help viewer, so this list costs nothing at start-up.
 */
export const HELP_ARTICLE_IDS = [
  'getting-started',
  'guided-tour',
  'projects',
  'drawings',
  'viewing-drawings',
  'segments',
  'highlighting',
  'equipment-library',
  'counting',
  'notes-and-links',
  'excel-template',
  'export',
  'checking-and-handover',
  'settings',
  'keyboard-shortcuts',
  'troubleshooting',
  'glossary',
] as const;

export type HelpArticleId = (typeof HELP_ARTICLE_IDS)[number];

/** A place in the documentation: an article, and optionally a heading anchor in it. */
export interface HelpTarget {
  articleId: HelpArticleId;
  sectionId?: string | null;
}

export function isHelpArticleId(id: string): id is HelpArticleId {
  return (HELP_ARTICLE_IDS as readonly string[]).includes(id);
}

/**
 * Where a link in an article leads: `counting.md#warnings`, `#warnings` (the
 * same article) or `../help/export.md`. Null for a link out of the documentation.
 */
export function resolveHelpLink(href: string, from: HelpArticleId): HelpTarget | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return null;
  const hash = href.indexOf('#');
  const path = hash >= 0 ? href.slice(0, hash) : href;
  const sectionId = hash >= 0 ? decodeURIComponent(href.slice(hash + 1)) || null : null;
  if (!path) return { articleId: from, sectionId };
  const name = path.split('/').pop()!.replace(/\.md$/i, '');
  return isHelpArticleId(name) ? { articleId: name, sectionId } : null;
}
