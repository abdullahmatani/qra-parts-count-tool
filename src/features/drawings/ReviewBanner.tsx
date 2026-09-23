import { AlertTriangle, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { markDrawingReviewed } from '@/domain/actions/drawings';
import { drawingDisplayName } from '@/domain/drawings';
import { useProjectStore } from '@/store/project-store';

/**
 * DRW-07: over a drawing whose new revision changed the sheet size, asks the
 * user to check its markers and clear the flag.
 */
export function ReviewBanner({ drawingId }: { drawingId: string }) {
  const { t } = useTranslation();
  const drawing = useProjectStore((s) => s.doc?.drawings[drawingId]);
  const readOnly = useProjectStore((s) => s.readOnly);
  if (!drawing?.needsReview) return null;
  return (
    <div
      role="status"
      data-testid="review-banner"
      className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 rounded-md border border-marker-warning/60 bg-background/95 px-3 py-2 text-sm shadow-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-marker-warning" />
      <p className="min-w-0 flex-1">{t('drawings.review.banner')}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={readOnly}
        onClick={() =>
          useProjectStore
            .getState()
            .apply(t('drawings.review.history', { drawing: drawingDisplayName(drawing) }), (d) =>
              markDrawingReviewed(d, drawingId),
            )
        }
      >
        <Check /> {t('drawings.review.done')}
      </Button>
    </div>
  );
}
