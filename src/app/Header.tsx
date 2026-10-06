import {
  BookOpen,
  ChevronDown,
  CircleHelp,
  Cog,
  FileOutput,
  FolderOpen,
  FolderPlus,
  Grid3x3,
  History,
  House,
  Keyboard,
  Route,
  Table2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { AppMark } from './AppMark';
import { OfflineIndicator } from './OfflineIndicator';
import { SaveIndicator } from './SaveIndicator';
import { openHelp } from '@/features/help/help-store';
import { exportProjectZip } from '@/features/project/project-zip-actions';
import { StageSwitcher } from '@/features/stage/StageSwitcher';
import { startGuidedTour, usePracticeProject } from '@/features/tour/tour-actions';
import { useTourStore } from '@/features/tour/tour-store';

export interface HeaderProps {
  onCloseProject?: () => void;
  /** Closes the project and starts a new one (from the app menu). */
  onNewProject?: () => void;
  /** Opens another project in place of this one (from the app menu). */
  onOpenProject?: () => void;
}

/**
 * The app menu behind the logo: back to the start screen, or straight on to
 * a new or another project (each closes the open project first); the guided
 * tour and the documentation.
 */
function AppMenu({ onCloseProject, onNewProject, onOpenProject }: HeaderProps) {
  const { t } = useTranslation();
  const practice = usePracticeProject();
  const touring = useTourStore((s) => s.active);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('header.appMenu')}
          className="flex shrink-0 items-center gap-0.5 rounded-md p-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <AppMark className="size-7" />
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('app.name')}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={!onCloseProject} onSelect={onCloseProject}>
          <House /> {t('header.startScreen')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!onNewProject} onSelect={onNewProject}>
          <FolderPlus /> {t('header.newProject')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!onOpenProject} onSelect={onOpenProject}>
          <FolderOpen /> {t('header.openProject')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {practice && !touring ? (
          <DropdownMenuItem onSelect={() => useTourStore.getState().resume()}>
            <Route /> {t('header.resumeTour')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void startGuidedTour()}>
            <Route /> {practice ? t('header.restartTour') : t('header.guidedTour')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => openHelp()}>
          <BookOpen /> {t('header.documentation')}
          <DropdownMenuShortcut>F1</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** App menu · project name · stage · save status · offline status · export · settings (FDS section 6). */
export function Header({ onCloseProject, onNewProject, onOpenProject }: HeaderProps) {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.doc?.name ?? '');
  const subtitle = useProjectStore((s) =>
    [s.doc?.client, s.doc?.facility, s.doc?.studyRef].filter(Boolean).join(' · '),
  );
  const readOnly = useProjectStore((s) => s.readOnly);
  const practice = usePracticeProject();
  const openDialog = useUiStore((s) => s.openDialog);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-panel ps-2 pe-2">
      <AppMenu
        onCloseProject={onCloseProject}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
      />
      <div className="min-w-0">
        <h1 className="truncate text-sm leading-tight font-semibold" data-testid="project-name">
          {name}
        </h1>
        {subtitle && (
          <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {readOnly && <Badge variant="outline">{t('header.readOnly')}</Badge>}
      {practice && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" data-testid="practice-badge">
              {t('tour.practice')}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{t('tour.practiceHint')}</TooltipContent>
        </Tooltip>
      )}
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <StageSwitcher />

      <div className="ms-auto flex items-center gap-3">
        <SaveIndicator />
        <OfflineIndicator />
        <Separator orientation="vertical" className="h-5!" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-tour="project-menu">
              {t('header.projectMenu')}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => openDialog('drawingRegister')}>
              <Table2 /> {t('header.drawingRegister')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog('library')}>
              <BookOpen /> {t('header.library')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog('templateMapper')}>
              <Grid3x3 /> {t('header.templateMapper')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog('linkSuggestions')}>
              {t('links.suggest.menu')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportProjectZip()}>
              {t('zip.menu')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog('backups')}>
              <History /> {t('header.backups')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog('shortcuts')}>
              <Keyboard /> {t('header.shortcuts')}
            </DropdownMenuItem>
            {onCloseProject && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onCloseProject}>
                  <X /> {t('header.closeProject')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" onClick={() => openDialog('export')} data-tour="export">
          <FileOutput />
          {t('header.export')}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('header.documentation')}
          title={t('header.documentationHint')}
          onClick={() => openHelp()}
        >
          <CircleHelp />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('header.settings')}
          onClick={() => openDialog('settings')}
        >
          <Cog />
        </Button>
      </div>
    </header>
  );
}
