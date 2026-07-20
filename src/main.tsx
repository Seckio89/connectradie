import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { registerServiceWorker } from './lib/serviceWorker';
import { initAnalytics } from './lib/analytics';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
  });
}

initAnalytics();

// ── Stale-bundle recovery ────────────────────────────────────────────────────
// After a deploy, an installed app can hold a cached index.html or lazy chunk
// that references content-hashed files no longer on the CDN. The failed dynamic
// import leaves the app hung on the Suspense spinner. Detect that failure and
// self-heal: clear caches + the service worker once, then hard-reload to pull
// the fresh bundle. A sessionStorage guard prevents a reload loop.
function isChunkLoadError(reason: unknown): boolean {
  const msg = String((reason as { message?: string } | undefined)?.message ?? reason ?? '');
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Failed to fetch dynamically/i.test(msg);
}
let recovering = false;
async function recoverFromStaleBundle() {
  if (recovering) return;
  recovering = true;
  const KEY = 'ct-stale-bundle-reload';
  if (sessionStorage.getItem(KEY)) return; // already tried once — avoid a loop
  sessionStorage.setItem(KEY, String(Date.now()));
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* best-effort — reload regardless */ }
  window.location.reload();
}
// Vite emits this when a preloaded/lazy chunk fails to load.
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recoverFromStaleBundle(); });
window.addEventListener('unhandledrejection', (e) => { if (isChunkLoadError(e.reason)) recoverFromStaleBundle(); });
// NOTE: the guard is intentionally NOT auto-cleared on `load`. It caps recovery
// at one hard-reload per app launch (sessionStorage clears when the tab/WebView
// is next launched), so a bundle that keeps failing can never spin us in a
// reload loop — critical in the Capacitor WebView.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>
);

registerServiceWorker();
