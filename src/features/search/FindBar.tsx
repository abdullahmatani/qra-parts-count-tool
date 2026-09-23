import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { drawingDisplayName } from '@/domain/drawings';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { openResult, searchProject, showHit } from './search-actions';
import { useSearchStore } from './search-store';
import { useSearchHits } from './useSearchHits';

/**
 * DRW-08: finds text (tag and line numbers) on the open drawing, with the
 * hits highlighted and stepped through, or across all drawings.
 */
export function FindBar() {
  const { t } = useTranslation();
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const index = useSearchStore((s) => s.index);
  const jumpToFirst = useSearchStore((s) => s.jumpToFirst);
  const project = useSearchStore((s) => s.project);
  const focusToken = useSearchStore((s) => s.focusToken);
  const drawingId = useUiStore((s) => s.activeDrawingId);
  const drawings = useProjectStore((s) => s.doc?.drawings);
  const { hits, loading } = useSearchHits(drawingId);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = hits.length ? Math.min(index, hits.length - 1) : -1;

  useEffect(() => {
    if (open) inputRef.current?.select();
  }, [open, focusToken]);

  // After opening a drawing from the project results, go to its first hit.
  useEffect(() => {
    if (!jumpToFirst || loading || !drawingId) return;
    useSearchStore.getState().setJumpToFirst(false);
    if (hits[0]) showHit(drawingId, hits[0]);
  }, [jumpToFirst, loading, hits, drawingId]);

  if (!open) return null;
  const store = useSearchStore.getState();
  const go = (delta: number) => {
    if (!drawingId || hits.length === 0) return;
    const next = (current + delta + hits.length) % hits.length;
    store.setIndex(next);
    showHit(drawingId, hits[next]!);
  };
  const status = !query.trim()
    ? ''
    : loading
      ? t('search.searching')
      : hits.length
        ? t('search.position', { index: current + 1, count: hits.length })
        : t('search.noMatches');
  const projectForQuery = project?.query === query ? project : null;

  return (
    <div
      className="absolute end-3 top-3 z-30 w-80 rounded-md border bg-background/95 p-2 text-sm shadow-md"
      data-testid="find-bar"
      role="search"
    >
      <div className="flex items-center gap-1">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          className="h-7"
          onChange={(event) => store.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              go(event.shiftKey ? -1 : 1);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              store.close();
              document.querySelector<HTMLElement>('[role="application"]')?.focus();
            }
          }}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('search.previous')}
          disabled={hits.length === 0}
          onClick={() => go(-1)}
        >
          <ChevronUp />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('search.next')}
          disabled={hits.length === 0}
          onClick={() => go(1)}
        >
          <ChevronDown />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={t('search.close')} onClick={store.close}>
          <X />
        </Button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span data-testid="find-status" aria-live="polite">
          {status}
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          disabled={!query.trim()}
          onClick={() => void searchProject(query)}
        >
          {t('search.allDrawings')}
        </Button>
      </div>
      {projectForQuery && (
        <div className="mt-2 border-t pt-2" data-testid="find-results">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {projectForQuery.done < projectForQuery.total && (
              <Loader2 className="size-3 animate-spin" />
            )}
            {projectForQuery.done < projectForQuery.total
              ? t('search.progress', { done: projectForQuery.done, total: projectForQuery.total })
              : t('search.found', { count: projectForQuery.results.length })}
          </p>
          <ul className="mt-1 max-h-48 overflow-y-auto">
            {projectForQuery.results.map((result) => {
              const drawing = drawings?.[result.drawingId];
              if (!drawing) return null;
              return (
                <li key={result.drawingId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-start text-xs hover:bg-accent"
                    onClick={() => openResult(result.drawingId)}
                  >
                    <span className="truncate font-mono">{drawingDisplayName(drawing)}</span>
                    <span className="text-muted-foreground">
                      {t('search.hits', { count: result.count })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
