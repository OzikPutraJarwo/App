const CACHE_NAME = 'pwa-task-planner';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './script.js',
  './style.css'
];

// 1. INSTALL
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. ACTIVATE
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache.startsWith('pwa-task-planner')) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. FETCH
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});