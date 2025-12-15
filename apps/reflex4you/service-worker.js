// apps/reflex4you/service-worker.js

// Bump these to force clients to pick up new precache content.
// Keep the main app version stable; bump only this minor cache suffix when needed.
const PRECACHE_NAME = 'reflex4you-precache-v11.3';
const RUNTIME_CACHE_NAME = 'reflex4you-runtime-v11.3';

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
  './image-export.mjs',
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

async function networkFirst(request, { fallbackUrl, timeoutMs = 3500 } = {}) {
  // On mobile/PWA resumes, `fetch()` for navigations can hang indefinitely.
  // Use an AbortController timeout and fall back to cache/app-shell.
  const hasAbortController = typeof AbortController === 'function';
  const controller = hasAbortController ? new AbortController() : null;
  const useTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const timeoutId =
    controller && useTimeout
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch (_) {
            // ignore
          }
        }, timeoutMs)
      : null;
  try {
    const response = controller ? await fetch(request, { signal: controller.signal }) : await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
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
    throw error;
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
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
    event.respondWith(networkFirst(request, { fallbackUrl, timeoutMs: 3500 }));
    return;
  }

  // Cache-first for same-origin static assets (JS/ESM, images, manifest, etc).
  event.respondWith(cacheFirst(request));
});
