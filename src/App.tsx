import { Button } from '@/components/ui/button';
import { useApplyPreferences } from '@/store/preferences';

export function App() {
  useApplyPreferences();
  return (
    <main className="p-6 font-sans">
      <h1 className="text-xl font-semibold">QRA Parts Count Tool</h1>
      <p className="font-mono text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
      <Button className="mt-4">Start</Button>
    </main>
  );
}
