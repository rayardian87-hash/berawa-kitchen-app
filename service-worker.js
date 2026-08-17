// Berawa Kitchen — service worker
// Cache app shell for offline use + handle notifications.

const CACHE_NAME = "berawa-kitchen-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/api.js",
  "./js/constants.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch((err) => console.error("SW install cache error:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

// Network-first for navigations/API-ish calls, cache-first for static assets.
// Never intercept cross-origin calls (Google Apps Script, Chart.js CDN).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});

// Best-effort periodic background sync (supported on some installed
// Android/Chrome PWAs). The actual due-date check needs live data from
// the Apps Script backend, which this simple SW cannot fetch on its own
// without the app's auth-free API context — so this fires a generic
// reminder to open the app; the in-app checker does the real due-date
// logic whenever the app is open.
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "berawa-kitchen-reminder") {
    event.waitUntil(
      self.registration.showNotification("Cek jatuh tempo sewa Berawa Kitchen", {
        body: "Buka aplikasi untuk lihat status pembayaran sewa terbaru.",
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
      })
    );
  }
});
