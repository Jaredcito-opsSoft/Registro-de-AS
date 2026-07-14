const CACHE_PREFIX = "asistencia-qr-static-";
const CACHE_VERSION = "asistencia-qr-static-2.49-supervisor-site-operations";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/notification-rules.js",
  "/auth.js",
  "/supabase-config.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

const SENSITIVE_PATH_PATTERN = /\/(?:rest|auth|storage|functions)\/v1(?:\/|$)/i;

function isStaticAsset(url) {
  return STATIC_ASSETS.includes(url.pathname);
}

function isSensitiveRequest(request, url) {
  return (
    SENSITIVE_PATH_PATTERN.test(url.pathname) ||
    request.headers.has("authorization") ||
    request.headers.has("x-client-info") ||
    request.headers.get("cache-control")?.includes("no-store")
  );
}

function isSafeStaticResponse(response) {
  if (!response || !response.ok || response.type !== "basic") return false;

  const cacheControl = response.headers.get("cache-control") || "";
  return !/no-store|private/i.test(cacheControl) && !response.headers.has("set-cookie");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isSensitiveRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Only the versioned app shell can be cached. Data, auth and evidence remain network-only.
  if (!isStaticAsset(url) || url.search) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (isSafeStaticResponse(response)) {
      const cache = await caches.open(CACHE_VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/?attendance=auto", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
