const CACHE_NAME = 'tubigwatch-v1';
// The home page is rendered from live upstream data and can take minutes, so it
// is left out of install and cached by the network-first handler on the first
// navigation instead.
const SHELL_ASSETS = ['/manifest.json', '/icon.svg'];
const STATIC_DESTINATIONS = ['style', 'script', 'font', 'image'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

// Build assets are immutable, so serve them from the cache first.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

// Pages and API responses should be as fresh as possible, but the last known
// copy is better than nothing during a typhoon.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Admin pages and their API must always reach the network: a cached override list would be
  // stale, and an authenticated GET must never be stored in the shared Cache API.
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')) return;

  if (request.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (STATIC_DESTINATIONS.includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});
