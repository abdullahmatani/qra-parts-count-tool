import { AlertTriangle, Check, CircleDashed, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceStore } from '@/store/workspace-store';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** Header save status, e.g. "Saved 10:42" (FDS section 6). */
export function SaveIndicator() {
  const { t } = useTranslation();
  const status = useWorkspaceStore((s) => s.saveStatus);
  const lastSavedAt = useWorkspaceStore((s) => s.lastSavedAt);
  const error = useWorkspaceStore((s) => s.saveError);

  let icon = <CircleDashed className="size-3.5" />;
  let text = t('save.idle');
  if (status === 'pending') text = t('save.pending');
  if (status === 'saving') {
    icon = <Loader2 className="size-3.5 animate-spin" />;
    text = t('save.saving');
  }
  if (status === 'saved' && lastSavedAt) {
    icon = <Check className="size-3.5 text-emerald-600" />;
    text = t('save.saved', { time: timeFormat.format(lastSavedAt) });
  }
  if (status === 'error') {
    icon = <AlertTriangle className="size-3.5 text-destructive" />;
    text = t('save.error');
  }

  const label = (
    <span
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-status={status}
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      {icon}
      {text}
    </span>
  );
  if (status !== 'error') return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent>{t('save.errorDetail', { error: error ?? '' })}</TooltipContent>
    </Tooltip>
  );
}
