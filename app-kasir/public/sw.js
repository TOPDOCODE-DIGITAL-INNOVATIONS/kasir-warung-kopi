// Service worker Kasir Warkop.
// - Saat install: cache index.html + semua JS/CSS yang direferensikan, supaya app bisa
//   langsung dibuka offline setelah instalasi pertama.
// - Navigasi: network-first (dapat versi terbaru), fallback ke cache saat offline.
// - Aset hash (/assets/*) & ikon: cache-first.
// - Request ke origin lain (mis. API sync) tidak pernah di-cache.
const CACHE_NAME = 'warkop-pos-v2';
const CORE_ASSETS = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg'];

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_ASSETS);

  // Ambil daftar bundle dari index.html hasil build
  try {
    const res = await fetch('/index.html', { cache: 'no-store' });
    const html = await res.text();
    const urls = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), (m) => m[1]);
    await cache.addAll([...new Set(urls)]);
  } catch (err) {
    console.warn('[sw] precache bundle gagal', err);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // jangan sentuh API eksternal

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
