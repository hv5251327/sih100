// MoSPI / NSSTA Service Worker - Zero-Interference Safe Mode
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Do NOT intercept navigation or API requests. Let browser handle natively.
self.addEventListener('fetch', (event) => {
  // Pass-through: Zero interception of HTML pages or API calls to prevent ERR_FAILED
  return;
});
