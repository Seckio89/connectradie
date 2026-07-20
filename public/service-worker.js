// Bump on any deploy that must invalidate stale caches. The `activate` handler
// deletes every cache not in the keep-list, so raising the version purges old
// hashed assets that could otherwise pin an installed app to a broken bundle.
const CACHE_NAME = 'connecttradie-v4';
const API_CACHE_NAME = 'connecttradie-api-v4';
const API_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
const APP_SHELL = [
  '/',
  '/dashboard',
  '/index.html',
  '/manifest.webmanifest',
];

const SYNC_QUEUE_STORE = 'sync-queue';
const DB_NAME = 'connecttradie-offline';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addToSyncQueue(action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    tx.objectStore(SYNC_QUEUE_STORE).add(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFromSyncQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const request = tx.objectStore(SYNC_QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearSyncQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    tx.objectStore(SYNC_QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keepCaches = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => !keepCaches.includes(key)).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== location.origin) return;

  // Cache Supabase REST GET requests with network-first strategy
  if (url.pathname.startsWith('/rest/') && request.method === 'GET') {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/functions/')) {
    return;
  }

  // Don't cache Vite dev server resources
  if (url.pathname.startsWith('/node_modules/') || url.pathname.startsWith('/@') || url.pathname.startsWith('/src/')) {
    return;
  }

  // Navigation requests (the HTML document) → NETWORK-FIRST. A stale-while-
  // revalidate index.html pins the app to old content-hashed JS bundles, so
  // deployed fixes never reach the installed (Capacitor) app until the cache
  // happens to refresh. Network-first means each app launch loads the latest
  // HTML (and therefore the latest bundles) when online, falling back to the
  // cached shell only when offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstDocument(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    return (
      cached ||
      (await cache.match('/index.html')) ||
      (await cache.match('/')) ||
      new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse || null);

  const response = cachedResponse || (await fetchPromise);
  // Must always return a valid Response — never undefined/null
  return response || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

async function networkFirstWithCache(request) {
  const cache = await caches.open(API_CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const responseWithTimestamp = networkResponse.clone();
      const headers = new Headers(responseWithTimestamp.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const body = await responseWithTimestamp.blob();
      const cachedResp = new Response(body, { status: networkResponse.status, statusText: networkResponse.statusText, headers });
      cache.put(request, cachedResp);
    }
    return networkResponse;
  } catch {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      const cachedAt = parseInt(cachedResponse.headers.get('sw-cached-at') || '0', 10);
      if (Date.now() - cachedAt < API_CACHE_MAX_AGE) {
        return cachedResponse;
      }
    }
    return new Response(JSON.stringify({ error: 'Offline', message: 'No cached data available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-job-actions') {
    event.waitUntil(replayQueuedActions());
  }
});

async function deleteFromSyncQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    tx.objectStore(SYNC_QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replayQueuedActions() {
  const actions = await getAllFromSyncQueue();
  if (!actions || actions.length === 0) return;

  let successCount = 0;
  let failCount = 0;

  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body,
      });

      if (response.ok || response.status === 409) {
        await deleteFromSyncQueue(action.id);
        successCount++;
      } else {
        failCount++;
      }
    } catch {
      failCount++;
    }
  }

  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      success: failCount === 0,
      count: successCount,
    });
  });
}

self.addEventListener('push', (event) => {
  let data = { title: 'ConnectTradie', body: 'You have a new notification', url: '/leads' };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // Use defaults
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/icon-192x192.svg',
    vibrate: [200, 100, 200],
    tag: data.tag || 'urgent-lead',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/leads' },
    actions: [
      { action: 'view', title: 'View Lead' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/leads';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'QUEUE_ACTION') {
    event.waitUntil(
      addToSyncQueue(event.data.payload).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ queued: true });
        }
      })
    );
  }

  if (event.data && event.data.type === 'REFRESH_TOKENS_AND_REPLAY') {
    event.waitUntil((async () => {
      const actions = await getAllFromSyncQueue();
      if (!actions || actions.length === 0) return;

      const freshToken = event.data.token;
      let successCount = 0;

      for (const action of actions) {
        if (action.headers && action.headers['Authorization']) {
          action.headers['Authorization'] = `Bearer ${freshToken}`;
        }

        try {
          const response = await fetch(action.url, {
            method: action.method,
            headers: action.headers,
            body: action.body,
          });

          if (response.ok || response.status === 409) {
            await deleteFromSyncQueue(action.id);
            successCount++;
          }
        } catch {
          // Will retry next reconnect
        }
      }

      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({
          type: 'SYNC_COMPLETE',
          success: true,
          count: successCount,
        });
      });
    })());
  }

  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification(event.data.title, {
        body: event.data.body,
        icon: '/icons/icon-192x192.svg',
        badge: '/icons/icon-192x192.svg',
        vibrate: [200, 100, 200],
        tag: 'urgent-lead',
        renotify: true,
        requireInteraction: true,
        data: { url: event.data.url || '/leads' },
        actions: [
          { action: 'view', title: 'View Lead' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      })
    );
  }
});
