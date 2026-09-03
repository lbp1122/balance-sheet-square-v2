const CACHE = "bss-v2-c72ee4c914c5";
const ASSETS = [
  "./",
  "./.nojekyll",
  "./app-icon-1024.png",
  "./app-icon-192.png",
  "./app-icon-512.png",
  "./apple-touch-icon.png",
  "./assets/index-BxoJG9gk.css",
  "./assets/index-VtUR8K0h.js",
  "./index.html",
  "./manifest.webmanifest",
  "./privacy.html"
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("bss-v2-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match("./index.html"))));
});
