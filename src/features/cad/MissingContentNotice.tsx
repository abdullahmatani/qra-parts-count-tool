import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { missingCount, type MissingContent } from './display-list';
import { missingLines } from './missing-content';

/**
 * DRW-02: over a CAD drawing with content the viewer cannot draw, says how
 * much is missing and, on demand, what it is, so it is checked against the
 * original before counting rather than overlooked.
 */
export function MissingContentNotice({ missing }: { missing: MissingContent | undefined }) {
  const { t } = useTranslation();
  const count = missingCount(missing);
  if (!missing || count === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="absolute end-3 top-3 z-20 h-7 border-marker-warning/60 bg-background/90 text-xs"
          data-testid="missing-content"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AlertTriangle className="text-marker-warning" />
          {t('cadMissing.button', { count })}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-3 text-sm"
        data-testid="missing-content-details"
      >
        <p className="mb-1 font-medium">{t('cadMissing.title')}</p>
        <p className="mb-2 text-xs text-muted-foreground">{t('cadMissing.intro')}</p>
        <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
          {missingLines(missing).map((line) => (
            <li key={line.text} className="flex items-baseline justify-between gap-2">
              <span>{line.text}</span>
              {line.type && (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {line.type}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">{t('cadMissing.hint')}</p>
      </PopoverContent>
    </Popover>
  );
}
