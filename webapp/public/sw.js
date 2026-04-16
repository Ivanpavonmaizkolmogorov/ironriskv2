// IronRisk PWA Service Worker
// Strategy: Network-first with fallback cache for app shell
const CACHE_NAME = 'ironrisk-v1';

// App shell files to pre-cache
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API calls: network only (real-time data, never cache)
  if (url.pathname.startsWith('/api/')) return;

  // Next.js dev assets: skip entirely so HMR works without interference
  if (url.pathname.startsWith('/_next/')) return;

  // Static assets: network-first with cache fallback
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?|ico|webp)$/)
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => {
          return cached || new Response('', { status: 503, statusText: 'Offline' });
        }))
    );
    return;
  }

  // HTML pages: network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        return cached || new Response('Servidor desconectado. Por favor, asegúrese de que la aplicación está en ejecución.', { 
          status: 503, 
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain; charset=utf-8'
          })
        });
      }))
