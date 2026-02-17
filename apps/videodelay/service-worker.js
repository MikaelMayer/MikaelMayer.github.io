// apps/videodelay/service-worker.js

const CACHE_NAME = 'delay-camera-cache-v9';

// 1) The root URL (“./”) ensures index.html is served at /apps/videodelay/ offline.
// 2) Then we list each file by its exact relative path:
const ASSETS_TO_CACHE = [
  './',             // maps to index.html on GitHub Pages
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logic.js',
  './app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');
  if (isHTML) {
    // Network-first for HTML to avoid stale pages/version labels.
    event.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(req))
    );
  } else {
    // Cache-first for static assets.
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req))
    );
  }
});

self.addEventListener('activate', event => {
  const keep = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.map(name => {
          if (!keep.includes(name)) {
            return caches.delete(name);
          }
        })
      )
    )
  );
});