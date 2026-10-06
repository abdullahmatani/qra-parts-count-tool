/**
 * The documentation viewer's content: a search box and the contents (or the
 * search results) on the left, the article on the right. Loaded on first use,
 * with the articles, so the documentation costs nothing at start-up.
 */
import { ChevronLeft, ChevronRight, FileText, Search, X } from 'lucide-react';
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchHelp, type HelpHit } from '@/domain/help/search';
import { cn } from '@/lib/utils';
import { HELP_ARTICLES, HELP_INDEX, articleById } from './articles';
import { useHelpStore } from './help-store';
import { resolveHelpLink, type HelpTarget } from './help-topics';
import { MarkedText, Markdown } from './Markdown';

function Snippet({ hit }: { hit: HelpHit }) {
  const { text, marks, before, after } = hit.snippet;
  const parts: React.ReactNode[] = [];
  let at = 0;
  marks.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={i} className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-500/40">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return (
    <span className="line-clamp-3 text-xs text-muted-foreground">
      {before && '… '}
      {parts}
      {after && ' …'}
    </span>
  );
}

export default function HelpCenter() {
  const { t } = useTranslation();
  const articleId = useHelpStore((s) => s.articleId);
  const sectionId = useHelpStore((s) => s.sectionId);
  const navigation = useHelpStore((s) => s.navigation);
  const query = useHelpStore((s) => s.query);
  const setQuery = useHelpStore((s) => s.setQuery);
  const navigate = useHelpStore((s) => s.navigate);
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(() => searchHelp(HELP_INDEX, deferredQuery), [deferredQuery]);
  const searching = deferredQuery.trim().length > 0;
  const [active, setActive] = useState(0);
  const article = articleById(articleId);
  const index = HELP_ARTICLES.indexOf(article);
  const previous = HELP_ARTICLES[index - 1];
  const next = HELP_ARTICLES[index + 1];
  const mainRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const incomplete = searching && result.hits.length > 0 && !result.hits[0]!.complete;

  // Brings the section into view on every navigation, or the top of the article.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const target = sectionId
      ? [...main.querySelectorAll<HTMLElement>('[data-anchor]')].find(
          (element) => element.dataset.anchor === sectionId,
        )
      : null;
    if (target) target.scrollIntoView?.({ block: 'start' });
    else main.scrollTop = 0;
  }, [articleId, sectionId, navigation]);

  // Keeps the result chosen with the arrow keys in view.
  useEffect(() => {
    resultsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const go = (target: HelpTarget) => navigate(target);
  const onLink = (href: string) => {
    const target = resolveHelpLink(href, articleId);
    if (target) go(target);
  };
  const openHit = (hit: HelpHit) =>
    go({
      articleId: hit.section.articleId as HelpTarget['articleId'],
      sectionId: hit.section.sectionId,
    });

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = result.hits.length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      setActive((i) => Math.min(count - 1, i + 1));
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      openHit(result.hits[Math.min(active, count - 1)]!);
    }
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[17rem_1fr] md:grid-cols-[19rem_1fr]">
      <aside className="flex min-h-0 flex-col border-e bg-panel" aria-label={t('help.contents')}>
        <div className="relative p-3">
          <Search className="pointer-events-none absolute start-5 top-5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKey}
            placeholder={t('help.searchPlaceholder')}
            aria-label={t('help.search')}
            role="combobox"
            aria-expanded={searching && result.hits.length > 0}
            aria-autocomplete="list"
            aria-controls="help-results"
            aria-activedescendant={
              searching && result.hits.length > 0
                ? `help-result-${Math.min(active, result.hits.length - 1)}`
                : undefined
            }
            data-testid="help-search"
            className="h-9 ps-8 pe-8 text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label={t('help.clear')}
              title={t('help.clear')}
              onClick={() => {
                setQuery('');
                setActive(0);
              }}
              className="absolute end-4 top-4.5 rounded p-0.5 text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {searching ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="px-4 pb-2 text-xs text-muted-foreground" role="status" aria-live="polite">
              {result.hits.length === 0
                ? t('help.noResults', { query: deferredQuery.trim() })
                : incomplete
                  ? t('help.partialResults', { count: result.hits.length })
                  : t('help.results', { count: result.hits.length })}
            </p>
            {result.hits.length === 0 && (
              <p className="px-4 text-xs text-muted-foreground">{t('help.noResultsHint')}</p>
            )}
            <ul
              id="help-results"
              ref={resultsRef}
              role="listbox"
              aria-label={t('help.resultsLabel')}
              className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
            >
              {result.hits.map((hit, i) => {
                const selected = i === active;
                const current =
                  hit.section.articleId === articleId && hit.section.sectionId === sectionId;
                return (
                  // Options are chosen with the pointer, or from the search box with the
                  // arrow keys and Enter (the combobox pattern), so they take no focus.
                  <li
                    key={`${hit.section.articleId}#${hit.section.sectionId ?? ''}`}
                    id={`help-result-${i}`}
                    role="option"
                    aria-selected={selected}
                    data-testid="help-result"
                    onClick={() => {
                      setActive(i);
                      openHit(hit);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-start',
                      selected ? 'bg-accent' : 'hover:bg-accent/60',
                      current && 'ring-1 ring-primary/30 ring-inset',
                    )}
                  >
                    <span className="text-sm font-medium">
                      <MarkedText text={hit.section.heading} marks={result.terms} />
                    </span>
                    {hit.section.sectionId && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <FileText className="size-3" />
                        {hit.section.articleTitle}
                      </span>
                    )}
                    {hit.snippet.text && <Snippet hit={hit} />}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" data-testid="help-toc">
            <ol className="space-y-0.5">
              {HELP_ARTICLES.map((item) => {
                const current = item.id === articleId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={current ? 'page' : undefined}
                      onClick={() => go({ articleId: item.id })}
                      title={item.summary}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-start text-sm',
                        current ? 'bg-accent font-medium' : 'hover:bg-accent/60',
                      )}
                    >
                      {item.title}
                    </button>
                    {current && item.headings.length > 0 && (
                      <ol className="my-1 ms-3 space-y-px border-s ps-2">
                        {item.headings.map((heading) => (
                          <li key={heading.id}>
                            <button
                              type="button"
                              onClick={() => go({ articleId: item.id, sectionId: heading.id })}
                              className={cn(
                                'w-full rounded px-2 py-1 text-start text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                                heading.id === sectionId && 'font-medium text-foreground',
                              )}
                            >
                              {heading.text}
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </aside>

      <div
        ref={mainRef}
        className="min-h-0 overflow-y-auto"
        data-testid="help-article"
        data-article={article.id}
      >
        <article className="mx-auto max-w-3xl px-8 py-6">
          <Markdown
            blocks={article.blocks}
            marks={searching ? result.terms : undefined}
            onLink={onLink}
          />
          <footer className="mt-10 flex items-center justify-between gap-4 border-t pt-4">
            {previous ? (
              <Button variant="ghost" size="sm" onClick={() => go({ articleId: previous.id })}>
                <ChevronLeft /> {previous.title}
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button variant="ghost" size="sm" onClick={() => go({ articleId: next.id })}>
                {next.title} <ChevronRight />
              </Button>
            )}
          </footer>
        </article>
      </div>
    </div>
  );
}
