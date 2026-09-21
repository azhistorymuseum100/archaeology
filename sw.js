// Arxeologiya audio bələdçisi üçün Service Worker
// Səhifə qabığını (shell) əvvəlcədən keşləyir, dinlənilmiş audio fayllarını isə
// istifadə zamanı avtomatik keşə əlavə edir (runtime caching).

const CACHE_NAME = 'matm-arxeologiya-v1';
const SHELL_FILES = [
  'vitrin.html',
  'manifest.json'
];

// Quraşdırma zamanı əsas faylları keşlə
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

// Köhnə keş versiyalarını təmizlə
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
// (bu strategiya həm HTML/manifest üçün, həm də dinlənilən mp3 fayllar üçün işləyir)
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
        // Həm keşdə, həm şəbəkədə yoxdursa (tam offline, ilk dəfə ziyarət) - heç nə edə bilmərik
      });
    })
  );
});
