/* Mes Courses — garde l'appli sur le téléphone pour qu'elle s'ouvre même
   sans réseau (dans le magasin). Stratégie : on affiche tout de suite la
   copie gardée, et on va chercher la nouvelle version en arrière-plan ;
   une mise à jour apparaît donc à l'ouverture suivante.
   Changer VERSION à chaque publication pour nettoyer les anciennes copies. */
var VERSION = '1.4';
var CACHE = 'mes-courses-' + VERSION;
var FICHIERS = ['./', 'index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf('mes-courses-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  var cle = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(cle, { ignoreSearch: true }).then(function (garde) {
      var reseau = fetch(req).then(function (rep) {
        if (rep && rep.ok) cache.put(cle, rep.clone());
        return rep;
      }).catch(function () { return garde; });
      if (garde) { e.waitUntil(reseau.catch(function () {})); return garde; }
      return reseau;
    });
  }));
});
