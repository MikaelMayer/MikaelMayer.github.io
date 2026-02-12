// apps/reflex4you/service-worker.js

// Bump these to force clients to pick up new precache content.
// Keep the main app version stable; bump only this minor cache suffix when needed.
//
// IMPORTANT: cache storage is shared across the entire origin (including GitHub Pages
// PR previews under `/pr-preview/...`). If we use a single global cache name, different
// deployments can overwrite each other and serve stale/mismatched assets.
// Include the service worker registration scope in cache keys to isolate deployments.
const CACHE_MINOR = '11.8';
const SCOPE =
  typeof self !== 'undefined' && self.registration && typeof self.registration.scope === 'string'
    ? self.registration.scope
    : '';
const SCOPE_KEY = SCOPE
  ? SCOPE.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(-64)
  : 'default';
const CACHE_PREFIX = `reflex4you:${SCOPE_KEY}:`;
const PRECACHE_NAME = `${CACHE_PREFIX}precache:v${CACHE_MINOR}`;
const RUNTIME_CACHE_NAME = `${CACHE_PREFIX}runtime:v${CACHE_MINOR}`;

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

async function matchFromNamedCaches(request) {
  // IMPORTANT: do not use `caches.match(request)` here.
  // `caches.match` searches *all* CacheStorage entries for the origin, which can
  // pick up stale responses from other deployments (e.g. GitHub Pages PR previews).
  const runtime = await caches.open(RUNTIME_CACHE_NAME);
  const hitRuntime = await runtime.match(request);
  if (hitRuntime) return hitRuntime;
  const precache = await caches.open(PRECACHE_NAME);
  return await precache.match(request);
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
          // Only clean up caches for *this* deployment scope.
          if (!keep.has(key) && key.startsWith(CACHE_PREFIX)) {
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
  const cached = await matchFromNamedCaches(request);
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
    const cached = await matchFromNamedCaches(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const fallback = await matchFromNamedCaches(fallbackUrl);
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
