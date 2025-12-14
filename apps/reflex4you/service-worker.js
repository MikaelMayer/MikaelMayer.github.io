// apps/reflex4you/service-worker.js

// Bump these to force clients to pick up new precache content.
const PRECACHE_NAME = 'reflex4you-precache-v7';
const RUNTIME_CACHE_NAME = 'reflex4you-runtime-v7';

// Precache the app shell + all ESM modules required to boot offline.
const PRECACHE_URLS = [
  './', // maps to index.html on many static hosts
  './index.html',
  './formula.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './Screenshot_20251213-082055.png',
  './main.js',
  './core-engine.mjs',
  './ast-utils.mjs',
  './arithmetic-parser.mjs',
  './parser-combinators.mjs',
  './parser-primitives.mjs',
  './parse-error-format.mjs',
  './formula-url.mjs',
  './formula-page.mjs',
  './formula-renderer.mjs',
];

function isSameOrigin(url) {
  return url && url.origin === self.location.origin;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([PRECACHE_NAME, RUNTIME_CACHE_NAME]);
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (!keep.has(key) && key.startsWith('reflex4you-')) {
            return caches.delete(key);
          }
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event?.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function networkFirst(request, { fallbackUrl } = {}) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) {
        return fallback;
      }
    }
    throw _;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return;
  }

  const isNavigation =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    const fallbackUrl = url.pathname.endsWith('/formula.html') ? './formula.html' : './index.html';
    event.respondWith(networkFirst(request, { fallbackUrl }));
    return;
  }

  // Cache-first for same-origin static assets (JS/ESM, images, manifest, etc).
  event.respondWith(cacheFirst(request));
});
