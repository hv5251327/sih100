// MoSPI / NSSTA Service Worker - Offline Field Caching Engine
const CACHE_NAME = 'mospi-field-pwa-v2';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './admin.html',
  './employee-login.html',
  './admin-login.html',
  './register.html',
  './app.js',
  './auth.js',
  './redirect.js',
  './offline-sync.js',
  './manifest.json',
  './style.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js'
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[MoSPI SW] Pre-caching offline assets...');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[MoSPI SW] Some assets failed to precache:', err);
      });
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[MoSPI SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First for static assets, Network-First for API with cache fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests (handled by IndexedDB offline queue)
  if (req.method !== 'GET') return;

  // For API requests, use Network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          return new Response(JSON.stringify({ offline: true, error: 'Offline - served from field cache' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // For static assets, HTML, Pyodide WASM, CDN fonts: Cache-first, then network with cache update
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (stale-while-revalidate)
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML page navigation
        if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
          return caches.match('./dashboard.html') || caches.match('./index.html');
        }
      });
    })
  );
});
