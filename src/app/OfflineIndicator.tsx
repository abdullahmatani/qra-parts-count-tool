import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';

/** Shows whether every app file is cached for offline use (NFR-01). */
export function OfflineIndicator() {
  const { t } = useTranslation();
  const ready = useUiStore((s) => s.offlineReady);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="offline-indicator"
          data-ready={ready}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
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
  );
}
