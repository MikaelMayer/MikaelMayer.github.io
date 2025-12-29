// apps/reflex4you/service-worker.js

// Bump these to force clients to pick up new precache content.
// Keep the main app version stable; bump only this minor cache suffix when needed.
//
// IMPORTANT: cache storage is shared across the entire origin (including GitHub Pages
// PR previews under `/pr-preview/...`). If we use a single global cache name, different
// deployments can overwrite each other and serve stale/mismatched assets.
// Include the service worker registration scope in cache keys to isolate deployments.
const CACHE_MINOR = '28.10';
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
  './explore.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './Screenshot_20251213-082055.png',
  './main.js',
  './formula-compile-worker.mjs',
  './menu-ui.mjs',
  './anim-utils.mjs',
  './explore-page.mjs',
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
    (async () => {
      // IMPORTANT: during SW install, `cache.addAll([...])` will use the browser's
      // normal HTTP cache. That can accidentally "re-precache" an older JS module
      // even after a hard reload, which then looks like a stale/mismatched deploy.
      //
      // Force a revalidation/reload so the precache reflects what's currently
      // served by the host (and avoid sticky stale JS warnings).
      const cache = await caches.open(PRECACHE_NAME);
      const requests = PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }));
      await cache.addAll(requests);
      await self.skipWaiting();
    })(),
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

function navigationRecoveryHtml(requestUrl) {
  const escapedUrl = String(requestUrl || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <title>Reflex4You – recovering…</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; color: rgba(255,255,255,0.92); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .wrap { padding: 18px 16px; max-width: 760px; }
    .card { margin-top: 14px; border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; background: rgba(255,255,255,0.06); padding: 14px 14px; }
    .muted { color: rgba(255,255,255,0.68); font-size: 13px; line-height: 1.35; }
    button { appearance: none; border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.92); border-radius: 10px; padding: 10px 12px; font-size: 14px; cursor: pointer; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div style="font-weight: 650; letter-spacing: 0.01em;">Reflex4You couldn’t start</div>
      <p class="muted">
        The app shell failed to load (often after the OS kills a backgrounded PWA).
        Tap reload to recover.
      </p>
      <p class="muted">Requested: <code>${escapedUrl}</code></p>
      <button type="button" onclick="location.replace('./index.html' + location.search + location.hash)">Reload</button>
    </div>
  </div>
  <script>
    // Auto-retry once: a fresh navigation often fixes transient fetch/SW glitches.
    setTimeout(() => {
      try { location.replace('./index.html' + location.search + location.hash); } catch (_) {}
    }, 400);
  </script>
</body>
</html>`;
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
    const fallbackUrl = url.pathname.endsWith('/formula.html')
      ? './formula.html'
      : url.pathname.endsWith('/explore.html')
        ? './explore.html'
        : './index.html';
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(request, { fallbackUrl, timeoutMs: 3500 });
        } catch (_) {
          // Last resort: never allow a navigation to reject, because some PWAs render
          // that as an empty/blank white screen after the splash.
          return new Response(navigationRecoveryHtml(url.href), {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  const path = (url.pathname || '').toLowerCase();
  const isJsModule =
    request.destination === 'script' ||
    path.endsWith('.js') ||
    path.endsWith('.mjs');

  // For code assets, prefer network-first so PR previews update quickly even if a
  // previous service worker version is still controlling the scope.
  if (isJsModule) {
    event.respondWith(networkFirst(request, { timeoutMs: 1500 }));
    return;
  }

  // Cache-first for non-code static assets (images, icons, etc).
  event.respondWith(cacheFirst(request));
});
