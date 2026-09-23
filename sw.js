// Arxeologiya audio bələdçisi üçün Service Worker
// STRATEGİYA: NETWORK-FIRST (əvvəlcə internet, sonra keş)
// Hər sorğuda əvvəlcə şəbəkədən ən son versiya yoxlanılır; uğurlu cavab
// dərhal göstərilir VƏ eyni zamanda keş yenilənir. Yalnız şəbəkə tamamilə
// əlçatan olmadıqda (offline) və ya müəyyən müddətdə cavab vermədikdə
// köhnə keşdən istifadə olunur. Bu sayədə ziyarətçi reload etdikdə həmişə
// ən son audio/mətn dəyişikliklərini görür, amma zəif siqnal olan zallarda
// səhifə tam donub qalmır.

const CACHE_NAME = 'matm-arxeologiya-v3'; // versiya artırıldı: köhnə "cache-first" keşi təmizləyir
const SHELL_FILES = [
  'index.html',
  'vitrin.html',
  'manifest.json'
];

// Şəbəkə cavabını gözləmə həddi (ms). Bundan uzun çəkərsə, mövcud keşə keçilir,
// amma şəbəkə sorğusu arxa planda davam edir və cavab gələndə keş yenilənir.
const NETWORK_TIMEOUT_MS = 4000;

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

    // Gözləmə həddi bitəndə, hələ şəbəkədən cavab gəlməyibsə, keşə keç
    const timeoutId = setTimeout(function() {
      if (settled) return;
      caches.match(request).then(function(cachedResponse) {
        if (settled) return;
        if (cachedResponse) {
          settled = true;
          resolve(cachedResponse);
        }
        // Keşdə də yoxdursa, aşağıdakı fetch().then/catch nəticəni idarə edəcək
      });
    }, NETWORK_TIMEOUT_MS);

    fetch(request).then(function(networkResponse) {
      clearTimeout(timeoutId);
      updateCache(request, networkResponse);
      if (!settled) {
        settled = true;
        resolve(networkResponse);
      }
      // settled artıq true-dursa (gözləmə həddi keşi göstərib), heç nə etmirik —
      // keş artıq bu fetch nəticəsi ilə yuxarıda yeniləndi (updateCache), növbəti
      // dəfə ziyarətçi ən son versiyanı alacaq.
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
  event.respondWith(networkFirst(event.request));
});
