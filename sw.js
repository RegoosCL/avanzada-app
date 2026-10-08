// Guarda la app en el teléfono para que abra rápido aunque haya mala señal.
const CACHE = "avanzada-v5";
const ARCHIVOS = ["./", "./index.html", "./config.js", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Primero internet (para recibir cambios), y si no hay señal, la copia guardada.
  // "no-cache" obliga a preguntarle a GitHub si hay versión nueva en vez de usar la del navegador.
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache" })
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});
