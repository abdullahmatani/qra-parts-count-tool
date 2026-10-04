import { useEffect } from 'react';
import { useUiStore } from '@/store/ui-store';
import { registerServiceWorker } from './service-worker';

/**
 * Registers the service worker in production builds, reports offline readiness
 * (NFR-01) and a new version waiting. Both show in the header's offline
 * indicator, not as toasts, so nothing covers the panes.
 */
export function useServiceWorker(enabled: boolean = import.meta.env.PROD): void {
  const setOfflineReady = useUiStore((s) => s.setOfflineReady);
  const setAppUpdate = useUiStore((s) => s.setAppUpdate);

  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    // A controlling worker means a previous visit already cached the app.
    if (navigator.serviceWorker.controller) setOfflineReady(true);
    registerServiceWorker({
      onOfflineReady: () => setOfflineReady(true),
      onNeedRefresh: (update) => setAppUpdate(() => void update()),
    });
  }, [enabled, setOfflineReady, setAppUpdate]);
}
