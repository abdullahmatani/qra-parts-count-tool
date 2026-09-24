import { Check, ChevronLeft, ChevronRight, Loader2, ScanSearch, X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { SIMILARITY_LEVELS, shownSuggestions, useAssistStore } from './assist-store';
import {
  acceptShownSuggestions,
  acceptSuggestions,
  closeSuggestions,
  rejectSuggestions,
  showSuggestion,
} from './find-similar';

const percent = (score: number) => Math.round(score * 100);

/**
 * Roadmap #60: steps through the symbol suggestions on the active drawing.
 * Each one is accepted (it becomes a marker with a count item) or rejected;
 * none is counted without the user's say-so.
 */
export function SuggestionBar() {
  const { t } = useTranslation();
  const status = useAssistStore((s) => s.status);
  const drawingId = useAssistStore((s) => s.drawingId);
  const suggestions = useAssistStore((s) => s.suggestions);
  const minScore = useAssistStore((s) => s.minScore);
  const index = useAssistStore((s) => s.index);
  const error = useAssistStore((s) => s.error);
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const readOnly = useProjectStore((s) => s.readOnly);
  const shown = useMemo(() => shownSuggestions({ suggestions, minScore }), [suggestions, minScore]);

  if (status === 'idle' || !drawingId || drawingId !== activeDrawingId) return null;
  const store = useAssistStore.getState();
  const current = shown.length ? Math.min(index, shown.length - 1) : -1;
  const suggestion = shown[current];
  const go = (delta: number) => {
    if (shown.length === 0) return;
    const next = (current + delta + shown.length) % shown.length;
    store.setIndex(next);
    showSuggestion(drawingId, shown[next]!);
  };
  /** After accepting or rejecting, the next suggestion takes the current place. */
  const showNext = () => {
    const state = useAssistStore.getState();
    const left = shownSuggestions(state);
    const next = left[Math.min(state.index, left.length - 1)];
    if (next) showSuggestion(drawingId, next);
  };

  return (
    <div
      className="absolute inset-x-3 top-12 z-30 mx-auto flex w-fit flex-wrap items-center gap-1.5 rounded-md border bg-background/95 p-1.5 text-sm shadow-md"
      data-testid="suggestion-bar"
      role="region"
      aria-label={t('assist.title')}
    >
      <ScanSearch className="ms-1 size-4 shrink-0 text-violet-600" />
      <span className="font-medium">{t('assist.title')}</span>
      {status === 'searching' && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {t('assist.searching')}
        </span>
      )}
      {status === 'error' && (
        <span className="text-destructive" data-testid="suggestion-error">
          {error}
        </span>
      )}
      {status === 'done' && shown.length === 0 && (
        <span className="text-muted-foreground" data-testid="suggestion-status">
          {t('assist.none')}
        </span>
      )}
      {status === 'done' && suggestion && (
        <>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('assist.previous')}
            onClick={() => go(-1)}
          >
            <ChevronLeft className="rtl:-scale-x-100" />
          </Button>
          <span className="tabular-nums" data-testid="suggestion-status" aria-live="polite">
            {t('assist.position', { index: current + 1, count: shown.length })}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('assist.next')}
            onClick={() => go(1)}
          >
            <ChevronRight className="rtl:-scale-x-100" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('assist.score', { score: percent(suggestion.score) })}
          </span>
          <Button
            size="sm"
            disabled={readOnly}
            onClick={() => {
              acceptSuggestions([suggestion.id]);
              showNext();
            }}
          >
            <Check /> {t('assist.accept')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              rejectSuggestions([suggestion.id]);
              showNext();
            }}
          >
            <X /> {t('assist.reject')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly}
            onClick={() => acceptShownSuggestions()}
          >
            {t('assist.acceptAll', { count: shown.length })}
          </Button>
        </>
      )}
      {(status === 'done' || status === 'searching') && (
        <Select
          value={String(minScore)}
          onValueChange={(value) => store.setMinScore(Number(value))}
        >
          <SelectTrigger size="sm" className="h-7 w-auto" aria-label={t('assist.similarity')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIMILARITY_LEVELS.map((level) => (
              <SelectItem key={level} value={String(level)}>
                {t('assist.atLeast', { score: percent(level) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('assist.close')}
        onClick={closeSuggestions}
      >
        <X />
      </Button>
    </div>
  );
}
