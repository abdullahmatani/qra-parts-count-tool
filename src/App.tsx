import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SettingsDialog } from '@/app/SettingsDialog';
import { StartScreen } from '@/app/StartScreen';
import { Workspace } from '@/app/Workspace';
import { useServiceWorker } from '@/app/useServiceWorker';
import { NewProjectDialog } from '@/features/project/NewProjectDialog';
import { ProjectSettingsForm } from '@/features/project/ProjectSettingsForm';
import { RecentProjects } from '@/features/project/RecentProjects';
import { closeProject, openProjectFromPicker } from '@/features/project/project-actions';
import { isFileSystemAccessSupported } from '@/lib/fs/support';
import { useApplyPreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

export function App() {
  const theme = useApplyPreferences();
  useServiceWorker();
  const hasProject = useProjectStore((s) => s.doc !== null);
  const openDialog = useUiStore((s) => s.openDialog);
  const supported = isFileSystemAccessSupported();

  return (
    <TooltipProvider delayDuration={400}>
      {hasProject ? (
        <Workspace onCloseProject={() => void closeProject()} />
      ) : (
        <StartScreen
          supported={supported}
          onNewProject={() => openDialog('newProject')}
          onOpenProject={() => void openProjectFromPicker()}
          recentProjects={supported ? <RecentProjects /> : undefined}
        />
      )}
      <NewProjectDialog />
      <SettingsDialog projectSettings={hasProject ? <ProjectSettingsForm /> : undefined} />
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
