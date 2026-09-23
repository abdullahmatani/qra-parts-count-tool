import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SettingsDialog } from '@/app/SettingsDialog';
import { StartScreen } from '@/app/StartScreen';
import { Workspace } from '@/app/Workspace';
import { useServiceWorker } from '@/app/useServiceWorker';
import { isFileSystemAccessSupported } from '@/lib/fs/support';
import { useApplyPreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';

export function App() {
  const theme = useApplyPreferences();
  useServiceWorker();
  const hasProject = useProjectStore((s) => s.doc !== null);

  return (
    <TooltipProvider delayDuration={400}>
      {hasProject ? <Workspace /> : <StartScreen supported={isFileSystemAccessSupported()} />}
      <SettingsDialog />
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
