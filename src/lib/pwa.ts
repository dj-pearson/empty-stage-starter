// PWA Service Worker Registration and Utilities

import { toast } from 'sonner';
import { logger } from '@/lib/logger';

const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      logger.info('Service Worker registered:', registration.scope);

      // Periodically check for updates, but only while the tab is visible —
      // and tear the timer down when the tab is hidden so we don't leak an
      // interval that runs forever in the background. (US-336)
      let updateTimer: ReturnType<typeof setInterval> | null = null;

      const startUpdateTimer = () => {
        if (updateTimer !== null) return;
        updateTimer = setInterval(() => {
          registration.update().catch((err) => logger.warn('SW update check failed:', err));
        }, SW_UPDATE_INTERVAL_MS);
      };

      const stopUpdateTimer = () => {
        if (updateTimer !== null) {
          clearInterval(updateTimer);
          updateTimer = null;
        }
      };

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') startUpdateTimer();
        else stopUpdateTimer();
      };

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('pagehide', stopUpdateTimer, { once: true });
      if (document.visibilityState === 'visible') startUpdateTimer();

      // Handle updates with a non-blocking prompt (never block the main thread
      // with a synchronous confirm()). (US-336)
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('New version available', {
              description: 'Reload to get the latest EatPal.',
              duration: Infinity,
              action: {
                label: 'Reload',
                onClick: () => {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                },
              },
            });
          }
        });
      });
    } catch (error) {
      logger.error('Service Worker registration failed:', error);
    }
  });
}

export async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export function isOnline() {
  return navigator.onLine;
}

export function onOnlineStatusChange(callback: (isOnline: boolean) => void) {
  // Capture stable handler references so removeEventListener actually removes
  // the same listeners on cleanup (the previous inline arrows leaked). (US-336)
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// Background sync for offline data
export async function registerSync(tag: string) {
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      // The Background Sync API isn't in the DOM lib types yet.
      const syncReg = registration as unknown as {
        sync: { register: (t: string) => Promise<void> };
      };
      await syncReg.sync.register(tag);
      logger.info('Background sync registered:', tag);
    } catch (error) {
      logger.error('Background sync registration failed:', error);
    }
  }
}
