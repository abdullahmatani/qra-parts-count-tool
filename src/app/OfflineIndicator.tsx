import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';

/** How long the indicator stands out after the app becomes available offline. */
const HIGHLIGHT_MS = 4000;

/**
 * Shows whether every app file is cached for offline use (NFR-01), and offers
 * to reload when a new version is waiting. When caching finishes the indicator
 * stands out for a moment and is announced, instead of a toast over the panes.
 */
export function OfflineIndicator() {
  const { t } = useTranslation();
  const ready = useUiStore((s) => s.offlineReady);
  const update = useUiStore((s) => s.appUpdate);
  // Stands out when it turns ready while shown, not when it is ready from the start.
  const [shownReady, setShownReady] = useState(ready);
  const [justReady, setJustReady] = useState(false);
  if (ready !== shownReady) {
    setShownReady(ready);
    setJustReady(ready);
  }
  useEffect(() => {
    if (!justReady) return;
    const timer = window.setTimeout(() => setJustReady(false), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [justReady]);

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            data-testid="offline-indicator"
            data-ready={ready}
            data-highlight={justReady}
            className={cn(
              // Padded throughout, so standing out moves nothing around it.
              'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground ring-emerald-500/40 transition-colors duration-700',
              justReady && 'bg-emerald-500/20 text-foreground ring-1',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('size-2 rounded-full', ready ? 'bg-emerald-500' : 'bg-amber-500')}
            />
            {ready ? t('offline.ready') : t('offline.caching')}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {ready ? t('offline.readyDetail') : t('offline.cachingDetail')}
        </TooltipContent>
      </Tooltip>
      {update && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={update}
              data-testid="app-update"
            >
              <RefreshCw /> {t('offline.update')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('offline.updateAvailable')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
