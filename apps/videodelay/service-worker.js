// apps/videodelay/service-worker.js

const CACHE_NAME = 'delay-camera-cache-v1';

// 1) The root URL (“./”) ensures index.html is served at /apps/videodelay/ offline.
// 2) Then we list each file by its exact relative path:
const ASSETS_TO_CACHE = [
  './',             // maps to index.html on GitHub Pages
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
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
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
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
