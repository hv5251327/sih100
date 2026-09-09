/**
 * MoSPI / NSSTA Service Worker - Offline Cache & PWA Manager
 */

const CACHE_NAME = 'mospi-portal-cache-v3';

const PRECACHE_ASSETS = [
  './',
  './dashboard.html',
  './index.html',
  './employee-login.html',
  './admin-login.html',
  './admin.html',
  './register.html',
  './offline-sync.js',
  './redirect.js',
  './style.css',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js'
];

// Installation: Pre-cache core static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[MoSPI ServiceWorker] Pre-caching static assets for offline use...');
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[MoSPI ServiceWorker] Pre-cache notice for ' + asset + ':', err.message);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activation: Clean up old caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[MoSPI ServiceWorker] Purging legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interception: Network-First for Navigation & APIs, Stale-While-Revalidate for Assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests (e.g. POST / PUT / DELETE)
  if (req.method !== 'GET') {
    return;
  }

  // 1. Navigation Requests (HTML Page loads / Reloads)
  if (req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline navigation fallback: Try matching requested URL, then fallback to dashboard or index
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match('./dashboard.html') ||
                           await caches.match('dashboard.html') ||
                           await caches.match('./index.html') ||
                           await caches.match('index.html');
          if (fallback) return fallback;
          return new Response('<!DOCTYPE html><html><head><title>MoSPI Offline</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>MoSPI Field Portal (Offline)</h2><p>Please check your connection or reload to access cached dashboard.</p><a href="./dashboard.html" style="color:#1e3a8a;font-weight:bold;">Go to Officer Dashboard</a></body></html>', {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // 2. API GET Requests (e.g. /api/...)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(JSON.stringify({ offline: true, message: 'Offline Mode - Data loaded from local cache' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 3. Static Assets (Scripts, Styles, Fonts, CDN Libraries, Images, Pyodide WASM)
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
