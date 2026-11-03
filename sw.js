// Offline support. The app's own files: network first so updates arrive at once, the cache when offline.
// Fonts: cache first. Nothing else is touched, so calls to AnkiConnect and Google go straight to the network.
const CACHE = 'immersion-dashboard-v3';
const FILER = ['./', 'index.html', 'css/app.css', 'config.js', 'js/app.js', 'js/calc.js', 'js/moln.js', 'js/plattform.js', 'js/garmin.js', 'js/sources.js', 'js/sqlite.js', 'js/store.js', 'js/view.js',
  'vendor/sql-wasm.js', 'vendor/sql-wasm.wasm', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILER)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const k = r.clone(); caches.open(CACHE).then(c => c.put(e.request, k)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(s => {
      const k = s.clone(); caches.open(CACHE).then(c => c.put(e.request, k)); return s;
    })));
  }
});
