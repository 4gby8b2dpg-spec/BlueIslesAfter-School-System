/* BlueIsles kiosk service worker.
 * Strategy: network-first with cache fallback for same-origin GETs. Online
 * visits always get fresh content (dev-safe — no stale Turbopack chunks) and
 * populate the cache; when the network is gone, the last-seen response is
 * served so the kiosk opens from a cold start. API calls are never cached.
 */
const VERSION = "v1";
const RUNTIME = `bi-runtime-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== RUNTIME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache the sync POSTs
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always hit the network

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME);
      try {
        const res = await fetch(req);
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await cache.match(url.pathname, { ignoreSearch: true });
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});

/* Background Sync (Chromium): when the browser regains connectivity it fires
 * this even if the tab was backgrounded. We can't read the page's localStorage
 * queue from here, so we wake any open kiosk client and let it flush. */
self.addEventListener("sync", (event) => {
  if (event.tag !== "kiosk-sync") return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      for (const client of clients) client.postMessage({ type: "kiosk-flush" });
    })(),
  );
});
