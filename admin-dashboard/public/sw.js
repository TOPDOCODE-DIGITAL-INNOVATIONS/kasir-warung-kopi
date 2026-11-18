// Unregister stale root service worker on localhost (app-kasir SW lives under /kasir/sw.js)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => self.clients.matchAll()).then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    })
  );
});
