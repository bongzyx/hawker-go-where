/**
 * Service worker. Not served in dev: the `serviceWorker` plugin in vite.config.ts
 * fills in the version and precache list at build time and emits this as /sw.js.
 *
 *   navigations          network first (3s), then the cached app shell
 *   /assets/* (hashed)   cache first, precached on install
 *   /api/*               untouched; useHawkers keeps its own offline copy
 *   other same-origin    stale-while-revalidate (fonts, glyphs, icons)
 *   map tiles/sprites    cache first, capped (URLs are versioned by OpenFreeMap)
 *   map styles/tilejson  network first
 */

const VERSION = "__HGW_VERSION__";
const PRECACHE = __HGW_PRECACHE__;

const SHELL = `hgw-shell-${VERSION}`;
const RUNTIME = "hgw-runtime-v1";
const TILES = "hgw-tiles-v1";
const TILE_LIMIT = 600;
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hgw-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return;
    if (request.mode === "navigate") return event.respondWith(navigate(event));
    if (url.pathname.startsWith("/assets/")) return event.respondWith(cacheFirst(request, SHELL));
    return event.respondWith(staleWhileRevalidate(event, RUNTIME));
  }

  if (url.hostname === "tiles.openfreemap.org") {
    const versioned = /^\/(planet\/\d|sprites\/|fonts\/)/.test(url.pathname);
    return event.respondWith(versioned ? cacheFirst(request, TILES, TILE_LIMIT) : networkFirst(request, RUNTIME));
  }

  if (url.hostname === "telegram.org" && url.pathname.startsWith("/js/")) {
    return event.respondWith(staleWhileRevalidate(event, RUNTIME));
  }
});

/** The page itself. Deep links (/?h=…) all resolve to the same shell. */
async function navigate(event) {
  const cache = await caches.open(SHELL);
  const network = fetch(event.request).then((response) => {
    if (response.ok) event.waitUntil(cache.put("/", response.clone()));
    return response;
  });
  const cached = await cache.match("/");
  if (!cached) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NAV_TIMEOUT_MS));
  return Promise.race([network.catch(() => cached), timeout]);
}

async function cacheFirst(request, name, limit) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(name);
    await cache.put(request, response.clone());
    if (limit) void trim(cache, limit);
  }
  return response;
}

async function networkFirst(request, name) {
  const cache = await caches.open(name);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

async function staleWhileRevalidate(event, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const network = fetch(event.request).then((response) => {
    // Opaque (cross-origin script) responses have status 0 but are still usable.
    if (response.ok || response.type === "opaque") return cache.put(event.request, response.clone()).then(() => response);
    return response;
  });
  if (hit) {
    event.waitUntil(network.catch(() => undefined));
    return hit;
  }
  return network;
}

let trimming = false;
/** Drop the oldest entries once the cache passes `limit` (keys() is insertion order). */
async function trim(cache, limit) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((k) => cache.delete(k)));
  } finally {
    trimming = false;
  }
}
