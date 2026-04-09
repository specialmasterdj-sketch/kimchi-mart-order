const CACHE_NAME = 'km-order-v19';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        './index.html',
        './products.js',
        './manifest.json'
      ]);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML and JS (always get latest code)
  if (url.pathname.endsWith('products.js') || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Images: DO NOT intercept - let browser handle normally
  // This prevents stale cache issues with product photos
  if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
    return; // browser default fetch
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(event.request).then(response => {
      return response;
    }).catch(() => caches.match(event.request))
  );
});
