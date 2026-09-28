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
import { openSampleFromPicker } from '@/features/sample/create-sample';
import { OpenZipDialog } from '@/features/project/OpenZipDialog';
import { LinkSuggestionsDialog } from '@/features/links/LinkSuggestionsDialog';
import { DeleteLinkDialog } from '@/features/links/DeleteLinkDialog';
import { DeleteDrawingDialog } from '@/features/drawings/DeleteDrawingDialog';
import { DrawingRegisterDialog } from '@/features/drawings/DrawingRegisterDialog';
import { importWithFeedback, openDrawingImport } from '@/features/drawings/import-actions';
import { SpacePickerDialog } from '@/features/drawings/SpacePickerDialog';
import { ExportDialog } from '@/features/export/ExportDialog';
import { TemplateMapperDialog } from '@/features/export/TemplateMapperDialog';
import { LibraryDialog } from '@/features/library/LibraryDialog';
import { MarkerFilterChips } from '@/features/markup/MarkerFilters';
import { MarkerInspector } from '@/features/markup/MarkerInspector';
import { MarkupViewer } from '@/features/markup/MarkupViewer';
import { ShortcutsDialog } from '@/features/markup/ShortcutsDialog';
import { NotesPanel } from '@/features/notes/NotesPanel';
import { NewSegmentDialog } from '@/features/segments/NewSegmentDialog';
import { SegmentDetails } from '@/features/segments/SegmentDetails';
import { useWorkspaceShortcuts } from '@/features/markup/shortcuts';
import { CountTablePanel } from '@/features/count/CountTablePanel';
import { useMarkerWarnings } from '@/features/count/useCount';
import { isFileSystemAccessSupported } from '@/lib/fs/support';
import { useApplyPreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';

export function App() {
  const theme = useApplyPreferences();
  useServiceWorker();
  const hasProject = useProjectStore((s) => s.doc !== null);
  const warningCount = useMarkerWarnings().size;
  useWorkspaceShortcuts(hasProject);
  const openDialog = useUiStore((s) => s.openDialog);
  const supported = isFileSystemAccessSupported();

  return (
    <TooltipProvider delayDuration={400}>
      {hasProject ? (
        <Workspace
          onCloseProject={() => void closeProject()}
          onImportDrawings={openDrawingImport}
          onDropFiles={(files) => void importWithFeedback(files)}
          renderDrawing={(drawingId) => <MarkupViewer drawingId={drawingId} />}
          onAddSegment={() => openDialog('newSegment')}
          rightPane={{
            segmentDetails: <SegmentDetails />,
            countTable: <CountTablePanel />,
            itemEditor: <MarkerInspector />,
            notes: <NotesPanel />,
          }}
          statusBar={{ warningCount, filterChips: <MarkerFilterChips /> }}
        />
      ) : (
        <StartScreen
          supported={supported}
          onNewProject={() => openDialog('newProject')}
          onOpenProject={() => void openProjectFromPicker()}
          onOpenSample={() => void openSampleFromPicker()}
          onOpenZip={() => openDialog('openZip')}
          recentProjects={supported ? <RecentProjects /> : undefined}
        />
      )}
      <NewProjectDialog />
      <OpenZipDialog />
      {hasProject && <BackupsDialog />}
      {hasProject && <LinkSuggestionsDialog />}
      {hasProject && <DeleteLinkDialog />}
      {hasProject && <DrawingRegisterDialog />}
      {hasProject && <DeleteDrawingDialog />}
      {hasProject && <SpacePickerDialog />}
      <ShortcutsDialog />
      {hasProject && <NewSegmentDialog />}
      {hasProject && <LibraryDialog />}
      {hasProject && <TemplateMapperDialog />}
      {hasProject && <ExportDialog />}
      <SettingsDialog projectSettings={hasProject ? <ProjectSettingsForm /> : undefined} />
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
