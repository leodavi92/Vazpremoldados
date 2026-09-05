const CACHE_NAME = 'app-fabrica-v4';
const ASSETS = [
  './',
  './index.html',
  './app-safety.js',
  './manifest.webmanifest',
  './app-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(key => key.startsWith('app-fabrica-') && key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  const isIndex = isSameOrigin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'));

  if (isNavigation || isIndex) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response.ok) throw new Error('Página indisponível');
          const responseToCache = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', responseToCache)));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!isSameOrigin || !response.ok) return response;
        const responseToCache = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache)));
        return response;
      });
    })
  );
});
