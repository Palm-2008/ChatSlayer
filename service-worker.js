const CACHE_NAME = 'chat-slayer-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './java.js',
  './manifest.json',
  './media/logo.jpg',
  './media/icon-96.png',
  './media/icon-128.png',
  './media/icon-144.png',
  './media/icon-180.png',
  './media/icon-192.png',
  './media/icon-512.png',
  './media/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // صفحات التطبيق والـ HTML: network-first مع fallback للنسخة المخبأة
  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // الأصول المحلية: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // الموارد البعيدة: network-first مع fallback
  event.respondWith(
    fetch(request).then((response) => {
      try {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
      } catch (_) {}
      return response;
    }).catch(() => caches.match(request))
  );
});
