const CACHE_NAME = 'km-order-v98';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Shell only. The big data files (products.js, seoul_extra.js, ...) are
      // loaded with a ?v= version tag and get cached on first use by the
      // cache-first rule below. Precaching the UN-versioned './products.js'
      // here used to download 4.4 MB on every install that the app never
      // read (the page always requests products.js?v=...), so it's dropped.
      return cache.addAll([
        './',
        './index.html',
        './manifest.json',
        './vela_stock.js'
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

  // Images: DO NOT intercept - let browser handle normally
  if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
    return;
  }

  // Versioned assets (loaded with ?v=...): CACHE-FIRST.
  // A ?v= tag makes the file immutable for that version — when the data or
  // code actually changes the app bumps ?v=, which is a brand-new URL and
  // misses the cache, so it re-fetches fresh. As long as the version is the
  // same the cached copy is guaranteed correct, so we serve it instantly
  // instead of re-downloading 4.4 MB of products.js on every single app open.
  // This is the main fix for "loading is too slow for the staff".
  if (url.searchParams.has('v') && url.pathname.endsWith('.js')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached; // instant — no network
        return fetch(event.request).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML, root path, manifest, and un-versioned JS: NETWORK-FIRST.
  // These are small (index.html ~124 KB) and we always want the latest code.
  // Cache fallback keeps the app working offline.
  if (url.pathname.endsWith('/') || url.pathname.endsWith('.html') ||
      url.pathname.endsWith('manifest.json') || url.pathname.endsWith('.js')) {
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

  // Everything else: network first, cache fallback
  event.respondWith(
    fetch(event.request).then(response => {
      return response;
    }).catch(() => caches.match(event.request))
  );
});
