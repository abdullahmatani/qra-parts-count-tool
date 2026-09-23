import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUiStore } from '@/store/ui-store';
import { registerServiceWorker } from './service-worker';

/**
 * Registers the service worker in production builds, reports offline readiness
 * (NFR-01) and offers a reload when a new version is waiting.
 */
export function useServiceWorker(enabled: boolean = import.meta.env.PROD): void {
  const { t } = useTranslation();
  const setOfflineReady = useUiStore((s) => s.setOfflineReady);

  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    // A controlling worker means a previous visit already cached the app.
    if (navigator.serviceWorker.controller) setOfflineReady(true);
    registerServiceWorker({
      onOfflineReady: () => {
        setOfflineReady(true);
        toast.success(t('offline.offlineReadyToast'));
      },
      onNeedRefresh: (update) => {
        toast(t('offline.updateAvailable'), {
          duration: Infinity,
          action: { label: t('common.reload'), onClick: () => void update() },
        });
      },
    });
  }, [enabled, setOfflineReady, t]);
}
