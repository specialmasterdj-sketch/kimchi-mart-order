const CACHE_NAME = 'km-order-v105';
const IMG_CACHE = 'km-order-img-v1';  // 이미지 전용 캐시 (버전 분리: shell 만 갱신해도 이미지는 유지)
const IMG_HOST_ALLOW = [
  'ecatalog.wismettacusa.com',   // Wismettac 외부 카탈로그
];

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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== IMG_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 이미지 캐시 정원사: 한 캐시당 ~1500 entries 로 제한해서 무한 성장 방지.
// (Wismettac 1311 + 모든 로컬 이미지 = 수천 장 가능, LRU-비슷한 단순 첫 N개 제거.)
async function trimImageCache(maxEntries){
  try {
    const cache = await caches.open(IMG_CACHE);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const toDelete = keys.length - maxEntries;
    for (let i = 0; i < toDelete; i++) await cache.delete(keys[i]);
  } catch(e){}
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isImage = url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i);

  // 이미지 — 모든 origin (로컬 + Wismettac 같은 화이트리스트 외부) 을 cache-first.
  // 첫 진입 때만 네트워크, 두 번째부터 instant. 사장님 발주 화면이 메인 hot path.
  if (isImage && (url.origin === self.location.origin || IMG_HOST_ALLOW.indexOf(url.hostname) >= 0)) {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          // no-cors 로 외부 이미지도 opaque response 로 캐시 가능
          const req = (url.origin !== self.location.origin)
            ? new Request(event.request.url, { mode: 'no-cors' })
            : event.request;
          return fetch(req).then(response => {
            if (response && (response.ok || response.type === 'opaque')) {
              cache.put(event.request, response.clone());
              // background trim — 응답에 영향 없이
              event.waitUntil(trimImageCache(1500));
            }
            return response;
          }).catch(() => cached || Response.error());
        })
      )
    );
    return;
  }

  // 그 외 cross-origin 은 sw 가 손대지 않음 (Firebase 등)
  if (url.origin !== self.location.origin) return;

  // Same-origin 의 비-이미지 자원: 아래 로직 계속

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
