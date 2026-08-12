/* //:ai safe PWA service worker
 *
 * Caches ONLY static shell assets (icons, offline page, hashed Next static files).
 * NEVER caches:
 * - HTML app routes / RSC payloads (auth + dynamic break data)
 * - /api/*
 * - Supabase / Auth / Google endpoints
 * - Requests with Authorization / Cookie credentials beyond navigation
 */

const VERSION = "bite-station-pwa-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const IS_LOCAL_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

if (IS_LOCAL_DEV) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.registration.unregister();
      })()
    );
  });
} else {

const PRECACHE_URLS = [
  "/offline.html",
  "/bite-station-logo-transparent.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
];

function isSensitiveRequest(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return true;

  const path = url.pathname;
  if (path.startsWith("/api/")) return true;

  // Never cache auth/session/data backends
  const host = url.hostname;
  if (
    host.includes("supabase.co") ||
    host.includes("googleapis.com") ||
    host.includes("google.com") ||
    host.includes("gstatic.com")
  ) {
    return true;
  }

  // Avoid caching credentialed API-ish fetches
  if (request.headers.get("authorization")) return true;

  return false;
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/offline.html" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn("[SW] precache skipped:", url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("obm-pwa-") && !key.startsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin app traffic for static shell caching
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isSensitiveRequest(request, url)) {
    return; // browser default network — no SW cache
  }

  // Navigations: network-only, offline fallback page (do not cache HTML responses)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match("/offline.html");
          return offline || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // Static assets only: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const shell = await caches.open(SHELL_CACHE);
          return (
            (await shell.match(request)) ||
            new Response("Offline", { status: 503 })
          );
        }
      })()
    );
  }
});

// Allow the page to ask the SW to skip waiting after updates
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
}
