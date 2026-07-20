import { Capacitor } from '@capacitor/core';

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  // Native Capacitor app: never use a service worker. The app loads the live
  // remote URL directly, so a SW adds no benefit — it only layers a cache in the
  // WebView that is a known cause of "stuck on the loading spinner after a
  // deploy" (a wedged SW serving a stale/broken bundle, which the WebView's less
  // predictable update cycle can't clear). Actively remove any SW a previous
  // build registered and purge its caches so the WebView always boots the live
  // bundle. Push/offline features use native plugins, not this web SW.
  if (Capacitor.isNativePlatform()) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Best-effort cleanup — nothing to register on native regardless.
    }
    return null;
  }

  // Don't register service workers in development — they intercept Vite's
  // module requests and break hot-module reloading.
  if (import.meta.env.DEV) {
    // Unregister any previously-registered SW so it stops intercepting requests
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const r of registrations) {
      await r.unregister();
    }
    return null;
  }

  try {
    // Only auto-reload on a SW UPDATE, not on first install. If a controller
    // already exists, a later `controllerchange` means a new SW took over
    // (skipWaiting + clients.claim) — reload once so the page picks up the
    // fresh HTML/bundle. The `refreshing` guard prevents reload loops.
    if (navigator.serviceWorker.controller) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }

    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
      // Always revalidate the SW script itself against the network so a new
      // version is detected promptly instead of being served from HTTP cache.
      updateViaCache: 'none',
    });

    // Proactively check for a new SW on startup (Capacitor apps stay open for
    // days, so the periodic browser check may not fire).
    registration.update().catch(() => {});

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // Could trigger UI notification for new version
      });
    });

    return registration;
  } catch {
    // Service workers not supported in this environment (e.g., StackBlitz)
    // This is expected and not a critical error
    // Service worker registration failed or not supported - this is expected in some environments
    return null;
  }
}

export async function queueOfflineAction(action: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}): Promise<boolean> {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return false;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data?.queued === true);
    };

    sw.postMessage({ type: 'QUEUE_ACTION', payload: action }, [channel.port2]);

    setTimeout(() => resolve(false), 3000);
  });
}

export async function requestBackgroundSync(tag = 'sync-job-actions'): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(tag);
      return true;
    }
  } catch {
    // Background sync not supported
  }
  return false;
}

export function onSyncMessage(callback: (data: { type: string; success: boolean; count: number }) => void) {
  if (!('serviceWorker' in navigator)) return () => {};

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'SYNC_COMPLETE') {
      callback(event.data);
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

export async function replayOnReconnect(): Promise<void> {
  if (!navigator.serviceWorker?.controller) return;
  if (!navigator.onLine) return;

  const { supabase } = await import('./supabase');
  const { data } = await supabase.auth.getSession();
  const freshToken = data.session?.access_token;
  if (!freshToken) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'REFRESH_TOKENS_AND_REPLAY',
    token: freshToken,
  });
}
