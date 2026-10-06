/**
 * The documentation articles, read from docs/help/*.md at build time. The same
 * files are the user guide in the repository, so the app and the guide never
 * differ. This module is only loaded with the help viewer.
 */
import { inlineText, parseMarkdown, type Block } from '@/domain/help/markdown';
import { buildHelpIndex, type HelpIndex } from '@/domain/help/search';
import { HELP_ARTICLE_IDS, type HelpArticleId } from './help-topics';

export interface HelpArticle {
  id: HelpArticleId;
  title: string;
  /** The first paragraph: what the article is about. */
  summary: string;
  blocks: Block[];
  /** The article's `##` headings, for the contents. */
  headings: { id: string; text: string }[];
}

const sources = import.meta.glob<string>('../../../docs/help/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function sourceOf(id: HelpArticleId): string {
  const entry = Object.entries(sources).find(([path]) => path.endsWith(`/${id}.md`));
  if (!entry) throw new Error(`docs/help/${id}.md is missing`);
  return entry[1];
}

export function parseArticle(id: HelpArticleId, source: string): HelpArticle {
  const blocks = parseMarkdown(source);
  const title = blocks.find((b) => b.type === 'heading' && b.level === 1);
  const intro = blocks.find((b) => b.type === 'paragraph');
  return {
    id,
    title: title?.type === 'heading' ? title.text : id,
    summary: intro?.type === 'paragraph' ? inlineText(intro.inlines) : '',
    blocks,
    headings: blocks.flatMap((b) =>
      b.type === 'heading' && b.level === 2 ? [{ id: b.id, text: b.text }] : [],
    ),
  };
}

export const HELP_ARTICLES: HelpArticle[] = HELP_ARTICLE_IDS.map((id) =>
  parseArticle(id, sourceOf(id)),
);

export const HELP_INDEX: HelpIndex = buildHelpIndex(HELP_ARTICLES);

/** The paths of the Markdown files found, for checking the list against the folder. */
export const HELP_SOURCE_PATHS = Object.keys(sources);

export function articleById(id: HelpArticleId): HelpArticle {
  return HELP_ARTICLES.find((article) => article.id === id) ?? HELP_ARTICLES[0]!;
}
