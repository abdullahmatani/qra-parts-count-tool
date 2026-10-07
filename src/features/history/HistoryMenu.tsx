import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/project-store';
import { describeStep } from './describe-step';
import { HistoryPreviewer, summarizeStep, type HistoryDirection } from './history-changes';
import { useHistoryPreviewStore } from './history-store';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The arrow beside Undo or Redo: lists the steps that can be undone (most
 * recent first) or redone (next first), each with a short summary of what it
 * changed. Pointing at a step highlights it and every step above it, which go
 * together, and greys out on the drawing what they would change (PRJ-09).
 */
export function HistoryMenu({ direction }: { direction: HistoryDirection }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const empty = useProjectStore((s) => (direction === 'undo' ? s.past : s.future).length === 0);
  const readOnly = useProjectStore((s) => s.readOnly);
  const disabled = empty || readOnly;
  const label = t(`history.${direction}.menu`);

  return (
    <DropdownMenu open={open && !disabled} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="-ms-1 w-4 rounded-s-none"
          aria-label={label}
          title={label}
          disabled={disabled}
          data-testid={`history-${direction}`}
        >
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      {open && !disabled && (
        <HistoryMenuContent direction={direction} onClose={() => setOpen(false)} />
      )}
    </DropdownMenu>
  );
}

function HistoryMenuContent({
  direction,
  onClose,
}: {
  direction: HistoryDirection;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const doc = useProjectStore((s) => s.doc);
  const stack = useProjectStore((s) => (direction === 'undo' ? s.past : s.future));
  const setPreview = useHistoryPreviewStore((s) => s.setPreview);
  // The step on top of the stack comes first: it is the one undone or redone next.
  const steps = useMemo(() => [...stack].reverse(), [stack]);
  const summaries = useMemo(
    () => (doc ? steps.map((step) => describeStep(summarizeStep(step, doc), t)) : []),
    [steps, doc, t],
  );
  const previewer = useMemo(
    () => (doc ? new HistoryPreviewer(doc, steps, direction) : null),
    [doc, steps, direction],
  );
  // Index of the last step that would go; the first one until the user points elsewhere.
  const [active, setActive] = useState(0);
  const last = Math.min(active, steps.length - 1);

  useEffect(() => {
    setPreview(previewer && last >= 0 ? previewer.preview(last + 1) : null);
  }, [previewer, last, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  const run = (count: number) => {
    const project = useProjectStore.getState();
    if (direction === 'undo') project.undo(count);
    else project.redo(count);
    onClose();
  };

  return (
    <DropdownMenuContent
      align="start"
      className="w-80 overflow-hidden"
      data-testid={`history-menu-${direction}`}
      data-steps={last + 1}
    >
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        {t(`history.${direction}.title`)}
      </DropdownMenuLabel>
      <div className="max-h-80 overflow-y-auto">
        {steps.map((step, i) => (
          <DropdownMenuItem
            key={stack.length - 1 - i}
            data-testid="history-step"
            data-in-range={i <= last ? 'true' : 'false'}
            className="items-start data-[in-range=true]:bg-primary/10 data-[in-range=true]:focus:bg-primary/15"
            onFocus={(event) => {
              setActive(i);
              // Radix moves the focus without scrolling when the arrow keys are used.
              event.currentTarget.scrollIntoView?.({ block: 'nearest' });
            }}
            onSelect={() => run(i + 1)}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate" data-testid="history-step-label">
                  {capitalise(step.label)}
                </span>
                <time
                  dateTime={new Date(step.at).toISOString()}
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                >
                  {timeFormat.format(step.at)}
                </time>
              </div>
              {summaries[i] && (
                <div
                  className={cn(
                    'truncate text-xs',
                    i <= last ? 'text-accent-foreground/80' : 'text-muted-foreground',
                  )}
                  title={summaries[i]}
                  data-testid="history-step-summary"
                >
                  {summaries[i]}
                </div>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuSeparator />
      <div className="px-2 py-1 text-xs" role="status">
        <div className="font-medium">{t(`history.${direction}.steps`, { count: last + 1 })}</div>
        <div className="text-muted-foreground">{t('history.preview')}</div>
      </div>
    </DropdownMenuContent>
  );
}
