// Arxeologiya audio bələdçisi üçün Service Worker
// Hər iki səhifəni (index.html - dropdown-lu ümumi baxış, vitrin.html - QR-kod üçün
// tək-vitrinlik səhifə) əvvəlcədən keşləyir. Dinlənilmiş audio fayllar isə istifadə
// zamanı avtomatik keşə əlavə olunur (runtime caching), beləliklə zəif internetli
// zallarda təkrar ziyarətlərdə səs kəsilmədən oxuyur.

const CACHE_NAME = 'matm-arxeologiya-v2';
const SHELL_FILES = [
  'index.html',
  'vitrin.html',
  'manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Sorğuları qarşıla: əvvəlcə keşdə axtar, tapılmazsa şəbəkədən götür və keşə əlavə et
// (HTML/manifest üçün olduğu kimi, dinlənilən mp3 fayllar üçün də işləyir)
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function() {
        // Həm keşdə, həm şəbəkədə yoxdursa (tam offline, ilk dəfə ziyarət) - edə biləcəyimiz bir şey yoxdur
      });
    })
  );
});
