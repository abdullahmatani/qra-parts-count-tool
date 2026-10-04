import {
  BookOpen,
  ChevronDown,
  Cog,
  FileOutput,
  Grid3x3,
  History,
  Keyboard,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { AppMark } from './AppMark';
import { OfflineIndicator } from './OfflineIndicator';
import { SaveIndicator } from './SaveIndicator';
import { exportProjectZip } from '@/features/project/project-zip-actions';
import { StageSwitcher } from '@/features/stage/StageSwitcher';

export interface HeaderProps {
  onCloseProject?: () => void;
}

/** Project name · stage · save status · offline status · export · settings (FDS section 6). */
export function Header({ onCloseProject }: HeaderProps) {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.doc?.name ?? '');
  const subtitle = useProjectStore((s) =>
    [s.doc?.client, s.doc?.facility, s.doc?.studyRef].filter(Boolean).join(' · '),
  );
  const readOnly = useProjectStore((s) => s.readOnly);
  const openDialog = useUiStore((s) => s.openDialog);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-panel ps-3 pe-2">
      <AppMark className="size-7 shrink-0" />
      <div className="min-w-0">
        <h1 className="truncate text-sm leading-tight font-semibold" data-testid="project-name">
          {name}
        </h1>
        {subtitle && (
          <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {readOnly && <Badge variant="outline">{t('header.readOnly')}</Badge>}
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <StageSwitcher />

      <div className="ms-auto flex items-center gap-3">
        <SaveIndicator />
        <OfflineIndicator />
        <Separator orientation="vertical" className="h-5!" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
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
        <Button size="sm" onClick={() => openDialog('export')}>
          <FileOutput />
          {t('header.export')}
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
