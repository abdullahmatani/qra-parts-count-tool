import { FileArchive, FolderOpen, FolderPlus, GraduationCap, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AppMark } from './AppMark';
import { OfflineIndicator } from './OfflineIndicator';

export interface StartScreenProps {
  supported: boolean;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onOpenSample?: () => void;
  onOpenZip?: () => void;
  recentProjects?: ReactNode;
}

/** Start screen: new project, open working directory, recent projects (FDS section 6). */
export function StartScreen({
  supported,
  onNewProject,
  onOpenProject,
  onOpenSample,
  onOpenZip,
  recentProjects,
}: StartScreenProps) {
  const { t } = useTranslation();
  return (
    <main
      className="flex h-full items-center justify-center bg-canvas p-8"
      data-testid="start-screen"
    >
      <div className="w-full max-w-3xl rounded-xl border bg-background p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <AppMark className="size-12" />
          <div>
            <h1 className="text-2xl font-semibold">{t('app.name')}</h1>
            <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
          </div>
          <div className="ms-auto">
            <OfflineIndicator />
          </div>
        </div>

        {!supported && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            {t('start.unsupported')}
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-start whitespace-normal"
            disabled={!supported || !onNewProject}
            onClick={onNewProject}
          >
            <span className="flex items-center gap-2 text-base font-medium">
              <FolderPlus /> {t('start.newProject')}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {t('start.newProjectDetail')}
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-start whitespace-normal"
            disabled={!supported || !onOpenProject}
            onClick={onOpenProject}
          >
            <span className="flex items-center gap-2 text-base font-medium">
              <FolderOpen /> {t('start.openProject')}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {t('start.openProjectDetail')}
            </span>
          </Button>
        </div>

        {onOpenSample && (
          <Button
            variant="ghost"
            className="mt-3 h-auto w-full justify-start gap-3 p-3 text-start whitespace-normal"
            disabled={!supported}
            onClick={onOpenSample}
          >
            <GraduationCap className="shrink-0" />
            <span className="flex flex-col items-start">
              <span className="font-medium">{t('start.sample')}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {t('start.sampleDetail')}
              </span>
            </span>
          </Button>
        )}

        {onOpenZip && (
          <Button
            variant="ghost"
            className="mt-1 h-auto w-full justify-start gap-3 p-3 text-start whitespace-normal"
            onClick={onOpenZip}
          >
            <FileArchive className="shrink-0" />
            <span className="flex flex-col items-start">
              <span className="font-medium">
                {supported ? t('zip.open') : t('zip.openReadOnly')}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {supported ? t('zip.openDetail') : t('zip.openReadOnlyDetail')}
              </span>
            </span>
          </Button>
        )}

        <section className="mt-8" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="text-sm font-semibold">
            {t('start.recent')}
          </h2>
          <div className="mt-2">
            {recentProjects ?? (
              <p className="text-sm text-muted-foreground">{t('start.noRecent')}</p>
            )}
          </div>
        </section>

        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" /> {t('start.privacyNote')}
        </p>
      </div>
    </main>
  );
}
