import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { segmentReadiness, type ReadinessIssue } from '@/domain/stage';
import { showMarker } from '@/features/segments/segment-commands';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { setStageCommand } from './stage';

const NAMES_SHOWN = 5;

/**
 * Moving on to the parts count: says what may not be finished in the
 * segments, with a way to go and look, before their set-up is locked.
 */
export function StartCountDialog() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.dialog === 'startCount');
  const openDialog = useUiStore((s) => s.openDialog);
  const doc = useProjectStore((s) => s.doc);
  const issues = useMemo(() => (open && doc ? segmentReadiness(doc) : []), [open, doc]);
  const segmentCount = doc?.segmentOrder.length ?? 0;

  const show = (issue: ReadinessIssue) => {
    const ui = useUiStore.getState();
    const [first] = issue.markerIds;
    if (first) {
      showMarker(first);
      ui.setHighlighted(issue.markerIds);
    } else if (issue.segmentIds[0]) {
      ui.setActiveSegment(issue.segmentIds[0]);
    }
    openDialog(null);
  };

  const start = () => {
    setStageCommand('count');
    openDialog(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => openDialog(next ? 'startCount' : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="size-5" /> {t('stage.start.title')}
          </DialogTitle>
          <DialogDescription>{t('stage.start.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm" data-testid="start-count-check">
          <p className="text-muted-foreground">
            {t('stage.start.summary', { count: segmentCount })}
          </p>
          {issues.length === 0 ? (
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-600" />
              {t('stage.start.ready')}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t('stage.start.issues')}</p>
              <ul className="space-y-1.5">
                {issues.map((issue) => {
                  const text = t(`stage.start.kinds.${issue.kind}`, { count: issue.count });
                  const more = issue.names.length - NAMES_SHOWN;
                  return (
                    <li
                      key={issue.kind}
                      className="flex items-start gap-2 rounded-md border px-2 py-1.5"
                      data-testid="readiness-issue"
                      data-kind={issue.kind}
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-marker-warning" />
                      <div className="min-w-0 flex-1">
                        <p>{text}</p>
                        {issue.names.length > 0 && (
                          <p className="truncate text-xs text-muted-foreground">
                            {issue.names.slice(0, NAMES_SHOWN).join(', ')}
                            {more > 0 ? ` +${more}` : ''}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        aria-label={`${t('stage.start.show')}: ${text}`}
                        onClick={() => show(issue)}
                      >
                        {t('stage.start.show')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => openDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={start}>
            {issues.length ? t('stage.start.confirmAnyway') : t('stage.start.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
