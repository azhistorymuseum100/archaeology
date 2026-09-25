// Arxeologiya audio bələdçisi üçün Service Worker
// STRATEGİYA:
//  - HTML/manifest/digər fayllar: NETWORK-FIRST (əvvəlcə internet, gözləmə həddi
//    keçərsə və ya offline olarsa keşdən).
//  - Audio (.mp3): NETWORK-FIRST + arxa planda tam faylın keşlənməsi. Bir dəfə
//    dinlənilən audio sonradan internetsiz də oxunur. Keşdəki audio "Range"
//    sorğularına (irəli-geri çəkmə) düzgün cavab verir.
//  - İstəyə bağlı: səhifədən mesajla bütün audioları əvvəlcədən yükləmək olar
//    (aşağıda "precache-audio" bölməsinə baxın).

const CACHE_NAME = 'matm-arxeologiya-v4'; // audio faylı eyni adla dəyişdirilərsə, bu ədədi artırın
const SHELL_FILES = [
  'index.html',
  'vitrin.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

const AUDIO_FILES = [
  'az_quruchay_kartal.mp3', 'az_mustye_kartal.mp3', 'az_men_med_kartal.mp3', 'az_qobustan_kartal.mp3',
  'en_quruchay_female.mp3', 'en_mustye_sarah.mp3', 'en_men_med_sarah.mp3', 'en_qobustan_sarah.mp3',
  'tr_quruchay.mp3', 'tr_mustye_murat.mp3', 'tr_men_med_murat.mp3', 'tr_qobustan_murat.mp3',
  'ru_quruchay.mp3', 'ru_mustye.mp3', 'ru_men_med.mp3', 'ru_qobustan.mp3'
];

const NETWORK_TIMEOUT_MS = 4000;
const inFlight = new Set();

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Bir fayl tapılmasa belə quraşdırma pozulmasın
      return Promise.all(SHELL_FILES.map(function(f) {
        return cache.add(f).catch(function() {});
      }));
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

function isAudio(url) {
  return /\.mp3$/i.test(new URL(url).pathname);
}

function updateCache(request, response) {
  if (response && response.status === 200) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) {
      cache.put(request, clone);
    });
  }
}

function offlineResponse() {
  return new Response('Offline: fayl əlçatan deyil.', { status: 503 });
}

// ---------- Ümumi fayllar: network-first ----------
function networkFirst(request) {
  const net = fetch(request);
  const timeout = new Promise(function(res) { setTimeout(function() { res(null); }, NETWORK_TIMEOUT_MS); });

  return Promise.race([net.catch(function() { return null; }), timeout]).then(function(resp) {
    if (resp) {
      updateCache(request, resp);
      return resp;
    }
    // ignoreSearch: vitrin.html?id=... kimi QR linkləri offline da keşdəki səhifəni tapsın
    return caches.match(request, { ignoreSearch: true }).then(function(cached) {
      if (cached) {
        // şəbəkə cavabı sonradan gəlsə, keşi yenilə
        net.then(function(r) { updateCache(request, r); }).catch(function() {});
        return cached;
      }
      return net.then(function(r) { updateCache(request, r); return r; })
                .catch(offlineResponse);
    });
  });
}

// ---------- Audio ----------
function cacheFullAudio(url) {
  if (inFlight.has(url)) return Promise.resolve();
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(url).then(function(hit) {
      if (hit) return;
      inFlight.add(url);
      return fetch(url).then(function(r) {
        if (r && r.status === 200) return cache.put(url, r);
      }).catch(function() {}).then(function() { inFlight.delete(url); });
    });
  });
}

function cachedAudio(request) {
  return caches.match(request.url).then(function(cached) {
    if (!cached) return null;
    const range = request.headers.get('range');
    if (!range) return cached;
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) return cached;
    return cached.blob().then(function(blob) {
      const size = blob.size;
      let start = m[1] === '' ? size - parseInt(m[2], 10) : parseInt(m[1], 10);
      let end = (m[1] === '' || m[2] === '') ? size - 1 : parseInt(m[2], 10);
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= size) end = size - 1;
      if (start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      }
      return new Response(blob.slice(start, end + 1), {
        status: 206,
        headers: {
          'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
          'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
          'Content-Length': String(end - start + 1),
          'Accept-Ranges': 'bytes'
        }
      });
    });
  });
}

function audioFirst(event) {
  const request = event.request;
  const net = fetch(request);
  const timeout = new Promise(function(res) { setTimeout(function() { res(null); }, NETWORK_TIMEOUT_MS); });

  return Promise.race([net.catch(function() { return null; }), timeout]).then(function(resp) {
    if (resp) {
      event.waitUntil(cacheFullAudio(request.url)); // arxa planda tam faylı saxla
      return resp;
    }
    return cachedAudio(request).then(function(c) {
      return c || net.catch(offlineResponse);
    });
  });
}

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return; // GA və s. toxunulmasın
  if (isAudio(event.request.url)) {
    event.respondWith(audioFirst(event));
  } else {
    event.respondWith(networkFirst(event.request));
  }
});

// ---------- İstəyə bağlı: audioları əvvəlcədən yükləmək ----------
// Səhifədən: navigator.serviceWorker.controller.postMessage({ type: 'precache-audio', lang: 'az' })
// "lang" verilməsə, bütün dillər yüklənir (mobil internet üçün ehtiyatlı olun).
self.addEventListener('message', function(event) {
  const data = event.data || {};
  if (data.type !== 'precache-audio') return;
  const files = AUDIO_FILES.filter(function(f) { return !data.lang || f.indexOf(data.lang + '_') === 0; });
  event.waitUntil(Promise.all(files.map(function(f) { return cacheFullAudio(new URL(f, self.registration.scope).href); })));
});
