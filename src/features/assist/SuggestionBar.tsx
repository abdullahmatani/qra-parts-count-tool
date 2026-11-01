import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ScanSearch,
  X,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSize } from '@/domain/sizes';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import {
  SIMILARITY_LEVELS,
  readingSizes,
  shownSuggestions,
  useAssistStore,
  type Suggestion,
} from './assist-store';
import {
  acceptShownSuggestions,
  acceptSuggestions,
  closeSuggestions,
  rejectSuggestions,
  showSuggestion,
} from './find-similar';

const percent = (score: number) => Math.round(score * 100);

/** What a suggestion counts as: its example's type, with the actuation of a valve. */
function useKindName(suggestion: Suggestion | undefined): string | null {
  const { t } = useTranslation();
  return useProjectStore((s) => {
    const doc = s.doc;
    if (!doc || !suggestion) return null;
    const item = Object.values(doc.items).find((i) => i.markerId === suggestion.exampleId);
    const type = doc.library.equipmentTypes.find((e) => e.id === item?.equipmentTypeId);
    if (!type) return null;
    return item?.actuation && type.hasActuation
      ? t('equipmentBar.withActuation', {
          type: type.name,
          actuation: t(`equipmentBar.actuation.${item.actuation}`),
        })
      : type.name;
  });
}

/**
 * The size a suggestion would be counted at, read from its line: the size,
 * or "Size pending" (with why) when it cannot be read and is left to the user.
 */
function SizeChip({ suggestion, t }: { suggestion: Suggestion; t: TFunction }) {
  const size = suggestion.size;
  if (size.status === 'unsized') return null;
  if (size.status === 'reading') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> {t('assist.sizes.reading')}
      </span>
    );
  }
  const [text, hint] =
    size.status === 'found'
      ? [
          t('assist.sizes.found', { size: formatSize(size.size) }),
          t('assist.sizes.foundHint', { text: size.source.text }),
        ]
      : [
          t('assist.sizes.pending'),
          size.status === 'conflict'
            ? t('assist.sizes.conflictHint', {
                labels: size.sources.map((s) => s.text).join(', '),
              })
            : t('assist.sizes.noneHint'),
        ];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="suggestion-size"
          data-status={size.status}
          tabIndex={0}
          className={
            size.status === 'found'
              ? 'rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-xs text-violet-700 dark:text-violet-300'
              : 'flex items-center gap-1 rounded bg-marker-warning/10 px-1.5 py-0.5 text-xs text-marker-warning'
          }
        >
          {size.status !== 'found' && <AlertTriangle className="size-3" />}
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Roadmap #60: steps through the symbol suggestions on the active drawing.
 * Each one is accepted (it becomes a marker with a count item) or rejected;
 * none is counted without the user's say-so.
 */
export function SuggestionBar() {
  const { t } = useTranslation();
  const status = useAssistStore((s) => s.status);
  const mode = useAssistStore((s) => s.mode);
  const progress = useAssistStore((s) => s.progress);
  const drawingId = useAssistStore((s) => s.drawingId);
  const suggestions = useAssistStore((s) => s.suggestions);
  const minScore = useAssistStore((s) => s.minScore);
  const index = useAssistStore((s) => s.index);
  const error = useAssistStore((s) => s.error);
  const activeDrawingId = useUiStore((s) => s.activeDrawingId);
  const readOnly = useProjectStore((s) => s.readOnly);
  const shown = useMemo(() => shownSuggestions({ suggestions, minScore }), [suggestions, minScore]);
  const current = shown.length ? Math.min(index, shown.length - 1) : -1;
  const suggestion = shown[current];
  const kind = useKindName(mode === 'identify' ? suggestion : undefined);
  // Accepting waits for the sizes, so nothing is counted at a size not yet read.
  const reading = readingSizes(suggestions);

  if (status === 'idle' || !drawingId || drawingId !== activeDrawingId) return null;
  const store = useAssistStore.getState();
  const title = mode === 'identify' ? t('assist.identifyTitle') : t('assist.title');
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
      aria-label={title}
      data-mode={mode}
    >
      <ScanSearch className="ms-1 size-4 shrink-0 text-violet-600" />
      {/* While reviewing, the title gives its room to the suggestion (the region keeps its name). */}
      <span
        className={
          status === 'done' && suggestion ? 'hidden font-medium 2xl:inline' : 'font-medium'
        }
      >
        {title}
      </span>
      {status === 'searching' && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />{' '}
          {progress
            ? t('assist.progress', { done: progress.done, total: progress.total })
            : t('assist.searching')}
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
            <ChevronLeft />
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
            <ChevronRight />
          </Button>
          {kind && (
            <span className="max-w-40 truncate text-xs font-medium" data-testid="suggestion-kind">
              {kind}
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('assist.score', { score: percent(suggestion.score) })}
          </span>
          <SizeChip suggestion={suggestion} t={t} />
          <Button
            size="sm"
            disabled={readOnly || reading}
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
            disabled={readOnly || reading}
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
