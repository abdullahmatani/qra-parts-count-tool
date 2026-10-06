import { BookOpen } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useHelpStore } from './help-store';

const HelpCenter = lazy(() => import('./HelpCenter'));

/** The documentation, searchable across every article, in a dialog (F1). */
export function HelpDialog() {
  const { t } = useTranslation();
  const open = useHelpStore((s) => s.open);
  const close = useHelpStore((s) => s.close);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        data-testid="help-dialog"
        className="flex h-[min(90vh,56rem)] w-[min(96vw,78rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        onEscapeKeyDown={(event) => {
          // The first Esc clears the search; the next closes the documentation.
          const help = useHelpStore.getState();
          if (help.query) {
            event.preventDefault();
            help.setQuery('');
          }
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-3 pe-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" /> {t('help.title')}
          </DialogTitle>
          <DialogDescription className="ms-auto hidden text-xs sm:block">
            {t('help.description')} <Kbd>F1</Kbd>
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={<p className="p-6 text-sm text-muted-foreground">{t('help.loading')}</p>}
        >
          <HelpCenter />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
