// MoSPI / NSSTA Service Worker - Offline Field Caching Engine
const CACHE_NAME = 'mospi-field-pwa-v4';

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
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'
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

// Fetch: ONLY handle GET requests for static UI assets. NEVER block or fake API responses.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Let browser natively handle API routes and cross-origin backends
  if (url.pathname.startsWith('/api/') || url.hostname.includes('onrender.com') || url.hostname.includes('supabase.co')) {
    return;
  }

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
        if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
          return caches.match('./dashboard.html') || caches.match('./index.html');
        }
      });
    })
  );
});
