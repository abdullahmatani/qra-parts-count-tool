// @vitest-environment node
/**
 * Keeps the built-in documentation whole: every article in docs/help/ is in
 * the contents, every link between articles lands on a heading that exists,
 * the guided tour's "Learn more" links are valid, and searches people are
 * likely to type find the right place.
 */
import { describe, expect, it } from 'vitest';
import type { Block, Inline } from '@/domain/help/markdown';
import { searchHelp } from '@/domain/help/search';
import { TOUR_STEPS } from '@/features/tour/tour-steps';
import { HELP_ARTICLES, HELP_INDEX, HELP_SOURCE_PATHS } from './articles';
import { HELP_ARTICLE_IDS, resolveHelpLink, type HelpTarget } from './help-topics';

function linksIn(blocks: readonly Block[]): string[] {
  const fromInlines = (inlines: readonly Inline[]): string[] =>
    inlines.flatMap((node) =>
      node.type === 'link'
        ? [node.href, ...fromInlines(node.children)]
        : node.type === 'strong' || node.type === 'em'
          ? fromInlines(node.children)
          : [],
    );
  return blocks.flatMap((block) => {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        return fromInlines(block.inlines);
      case 'list':
        return block.items.flatMap((item) => linksIn(item));
      case 'table':
        return [...block.header, ...block.rows.flat()].flatMap(fromInlines);
      case 'quote':
        return linksIn(block.children);
      default:
        return [];
    }
  });
}

function anchorsOf(blocks: readonly Block[]): Set<string> {
  return new Set(blocks.flatMap((b) => (b.type === 'heading' ? [b.id] : [])));
}

const exists = (target: HelpTarget) => {
  const article = HELP_ARTICLES.find((a) => a.id === target.articleId);
  return !!article && (!target.sectionId || anchorsOf(article.blocks).has(target.sectionId));
};

describe('built-in documentation', () => {
  it('lists every article in docs/help, and only those', () => {
    const files = HELP_SOURCE_PATHS.map((path) => path.split('/').pop()!.replace(/\.md$/, ''));
    expect([...files].sort()).toEqual([...HELP_ARTICLE_IDS].sort());
  });

  it('gives every article a title and a summary', () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title, article.id).not.toBe(article.id);
      expect(article.summary.length, article.id).toBeGreaterThan(20);
      expect(article.blocks.filter((b) => b.type === 'heading' && b.level === 1)).toHaveLength(1);
    }
  });

  it('links only to articles and headings that exist', () => {
    const broken: string[] = [];
    for (const article of HELP_ARTICLES) {
      for (const href of linksIn(article.blocks)) {
        if (/^https?:/.test(href)) continue;
        const target = resolveHelpLink(href, article.id);
        if (!target || !exists(target)) broken.push(`${article.id}: ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('gives each tour step a "Learn more" place that exists', () => {
    for (const step of TOUR_STEPS) expect(exists(step.help), step.id).toBe(true);
  });

  it.each([
    ['auto trace', 'highlighting', 'auto-trace'],
    ['end flange', 'segments', 'mark-end-flanges'],
    ['find similar symbols', 'counting', 'find-similar-symbols'],
    ['A2.1', 'excel-template', 'the-a21-parts-count-sheet'],
    ['backup restore', 'projects', 'saving-undo-and-backups'],
    ['firefox', 'checking-and-handover', 'firefox-and-safari'],
    ['how do I undo a mistake', 'troubleshooting', 'how-do-i-undo-a-mistake'],
    ['split view', 'viewing-drawings', 'split-view'],
    ['stamp', 'counting', 'stamp'],
    ['hilighter follow lines', 'highlighting', 'follow-lines'],
  ])('finds “%s” in %s#%s', (query, articleId, sectionId) => {
    const top = searchHelp(HELP_INDEX, query).hits.slice(0, 3);
    expect(
      top.map((hit) => `${hit.section.articleId}#${hit.section.sectionId}`),
      query,
    ).toContain(`${articleId}#${sectionId}`);
  });

  it('searches every article', () => {
    const found = new Set(
      searchHelp(HELP_INDEX, 'the', { limit: 1000 }).hits.map((hit) => hit.section.articleId),
    );
    expect([...found].sort()).toEqual([...HELP_ARTICLE_IDS].sort());
  });
});

describe('links between articles', () => {
  it('resolves files, anchors and the same article', () => {
    expect(resolveHelpLink('counting.md#warnings', 'export')).toEqual({
      articleId: 'counting',
      sectionId: 'warnings',
    });
    expect(resolveHelpLink('#warnings', 'counting')).toEqual({
      articleId: 'counting',
      sectionId: 'warnings',
    });
    expect(resolveHelpLink('../help/export.md', 'counting')).toEqual({
      articleId: 'export',
      sectionId: null,
    });
    expect(resolveHelpLink('https://example.com', 'counting')).toBeNull();
    expect(resolveHelpLink('other.md', 'counting')).toBeNull();
  });
});
