// Service worker minimal untuk BWOS.
// Aturan main: JANGAN pernah cache HTML atau /api — data harus selalu segar.
// Yang di-cache hanya aset statis (ikon & manifest) agar app bisa dipasang di HP.
const CACHE = "bwos-static-v1";
const ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const cacheable = url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/apple-touch-icon.png";
  if (!cacheable) return; // biarkan browser yang menangani (selalu online-first)
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
    ),
  );
});
