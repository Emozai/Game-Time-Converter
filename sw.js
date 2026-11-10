/* Game Time Converter — offline support.
   Bump VERSION whenever index.html changes so phones pick up the update. */
const VERSION = 'gtc-v22';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  // save the PDF reader for offline use, without holding up the app
  caches.open(VERSION).then(c => c.addAll(['./lib/pdf.min.mjs', './lib/pdf.worker.min.mjs'])).catch(() => {});
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // fonts etc.: let the browser handle them
  if (url.pathname.startsWith('/api/')) return;         // live lookups (dual calls): always from the network

  // Page and voyage data: try the network first so updates arrive, fall back to the saved copy offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('/site-data.json') || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (icons, PDF reader): saved copy first, download once if missing.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});

// tapping a dual-call notification opens the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./#dualCard');
  }));
});
