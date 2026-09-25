// Arxeologiya audio bələdçisi üçün Service Worker
// STRATEGİYA: NETWORK-FIRST (HTML/CSS/JS/manifest üçün), AUDIO FAYLLARI ÜÇÜN BYPASS
//
// Audio (.mp3) sorğuları bu Service Worker tərəfindən HEÇ TUTULMUR — birbaşa
// brauzerin öz şəbəkə mexanizminə ötürülür. Səbəb: <audio> elementləri çox vaxt
// "Range" (qismən) sorğular göndərir (səsi hissə-hissə yükləmək/axtarmaq üçün).
// Service Worker-in cache API-si bu qismən sorğuları düzgün emal etməsə, audio
// yarıda ilişə və ya heç açılmaya bilər — xüsusən köhnə Android brauzerlərində.
// Ona görə audio faylları tamamilə bu SW-nin nəzarətindən kənarda saxlanılır.

const CACHE_NAME = 'matm-arxeologiya-v4';
const SHELL_FILES = [
  'index.html',
  'vitrin.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

const NETWORK_TIMEOUT_MS = 4000;

function isAudioRequest(request) {
  // Fayl uzantısına görə audio sorğularını tanıyır (mp3, wav, m4a, ogg və s.)
  return /\.(mp3|wav|m4a|ogg|aac)(\?.*)?$/i.test(request.url) ||
         request.headers.has('range');
}

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

function updateCache(request, response) {
  if (response && response.status === 200) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) {
      cache.put(request, clone);
    });
  }
}

function networkFirst(request) {
  return new Promise(function(resolve) {
    let settled = false;

    const timeoutId = setTimeout(function() {
      if (settled) return;
      caches.match(request).then(function(cachedResponse) {
        if (settled) return;
        if (cachedResponse) {
          settled = true;
          resolve(cachedResponse);
        }
      });
    }, NETWORK_TIMEOUT_MS);

    fetch(request).then(function(networkResponse) {
      clearTimeout(timeoutId);
      updateCache(request, networkResponse);
      if (!settled) {
        settled = true;
        resolve(networkResponse);
      }
    }).catch(function() {
      clearTimeout(timeoutId);
      if (settled) return;
      caches.match(request).then(function(cachedResponse) {
        if (settled) return;
        settled = true;
        if (cachedResponse) {
          resolve(cachedResponse);
        } else {
          resolve(new Response('Offline: fayl əlçatan deyil.', { status: 503 }));
        }
      });
    });
  });
}

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  // Audio sorğuları: bu SW-dən keçmir, birbaşa şəbəkəyə/brauzerə buraxılır.
  if (isAudioRequest(event.request)) {
    return; // respondWith çağırılmır = brauzer sorğunu öz normal yolu ilə idarə edir
  }

  event.respondWith(networkFirst(event.request));
});
