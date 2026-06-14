const CACHE_NAME = 'km-order-v113';
// 이미지 전용 캐시. v2 = 이전 버전(v1)이 외부 Wismettac 이미지를 no-cors 로
// 가로채 캐시했던 깨진 opaque/error 응답을 전부 폐기하기 위해 이름을 올림.
const IMG_CACHE = 'km-order-img-v2';

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
// (로컬 이미지가 수천 장 가능, LRU-비슷한 단순 첫 N개 제거.)
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

  // ⚠️ Cross-origin 은 SW 가 절대 가로채지 않는다 (Firebase + Wismettac 외부 이미지).
  // 외부 이미지를 SW 가 no-cors 로 re-fetch 하면 (1) Referer 가 바뀌어 호스트의
  // 핫링크 차단(403)을 유발하고, (2) 죽은 호스트(503/11초) 요청이 SW 큐에 쌓여
  // 페이지가 더 느려진다. 외부 이미지는 브라우저 네이티브 로딩에 맡긴다.
  if (url.origin !== self.location.origin) return;

  const isImage = url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i);

  // 로컬 이미지(images/...): cache-first — 두 번째 진입부터 instant.
  if (isImage) {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
              event.waitUntil(trimImageCache(1500));
            }
            return response;
          }).catch(() => cached || Response.error());
        })
      )
    );
    return;
  }

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
