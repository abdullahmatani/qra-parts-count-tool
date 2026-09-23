import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SettingsDialog } from '@/app/SettingsDialog';
import { StartScreen } from '@/app/StartScreen';
import { Workspace } from '@/app/Workspace';
import { useServiceWorker } from '@/app/useServiceWorker';
import { BackupsDialog } from '@/features/project/BackupsDialog';
import { NewProjectDialog } from '@/features/project/NewProjectDialog';
import { ProjectSettingsForm } from '@/features/project/ProjectSettingsForm';
import { RecentProjects } from '@/features/project/RecentProjects';
import { closeProject, openProjectFromPicker } from '@/features/project/project-actions';
import { DrawingRegisterDialog } from '@/features/drawings/DrawingRegisterDialog';
import { importWithFeedback, openDrawingImport } from '@/features/drawings/import-actions';
import { DrawingViewer } from '@/features/viewer/DrawingViewer';
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
        <Workspace
          onCloseProject={() => void closeProject()}
          onImportDrawings={openDrawingImport}
          onDropFiles={(files) => void importWithFeedback(files)}
          renderDrawing={(drawingId) => <DrawingViewer drawingId={drawingId} />}
        />
      ) : (
        <StartScreen
          supported={supported}
          onNewProject={() => openDialog('newProject')}
          onOpenProject={() => void openProjectFromPicker()}
          recentProjects={supported ? <RecentProjects /> : undefined}
        />
      )}
      <NewProjectDialog />
      {hasProject && <BackupsDialog />}
      {hasProject && <DrawingRegisterDialog />}
      <SettingsDialog projectSettings={hasProject ? <ProjectSettingsForm /> : undefined} />
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
