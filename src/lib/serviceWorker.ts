export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // Could trigger UI notification for new version
      });
    });

    return registration;
  } catch (err) {
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
      await (registration as any).sync.register(tag);
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
