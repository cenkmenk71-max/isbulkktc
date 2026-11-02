/*
 * İşBul KKTC service worker.
 *
 * Hand-written rather than generated, because the caching policy has to make
 * per-request privacy decisions that a generic precache manifest cannot:
 *
 *  - Only same-origin GET requests are ever stored.
 *  - `/api/**`, `/auth/**` and every RSC payload request (`?_rsc=`, the `RSC`
 *    header, or Next's prefetch header) are never cached. Those responses carry
 *    the signed-in user's data — application lists, profile details, dashboard
 *    payloads — and a shared HTTP cache keyed by URL would serve one account's
 *    data to the next person who uses the device.
 *  - Navigations are network-first: fresh server HTML wins, and a cached page or
 *    the offline document is only a fallback. Serving a stale app shell ahead of
 *    the network is how a deployed update stops reaching people.
 *  - Hashed build assets (`/_next/static/**`) are immutable, so they are
 *    cache-first. The browser cache is not trusted for this because a cold
 *    start of the installed app has no HTTP cache entry.
 *  - The cache is bounded: entries are trimmed on write, so storage cannot grow
 *    without limit on a device that only ever visits this app.
 *
 * `CACHE_VERSION` must be bumped when this file's policy changes. The activate
 * handler deletes every cache whose name is not in the current list.
 */

const CACHE_VERSION = "v1";
const PRECACHE = `isbulk-precache-${CACHE_VERSION}`;
const PAGES = `isbulk-pages-${CACHE_VERSION}`;
const ASSETS = `isbulk-assets-${CACHE_VERSION}`;
const IMAGES = `isbulk-images-${CACHE_VERSION}`;
const CURRENT_CACHES = [PRECACHE, PAGES, ASSETS, IMAGES];

const OFFLINE_URL = "/offline.html";

// Icons are tiny and are needed for the notification fallback and the offline
// screen, so they are worth having on disk before the first offline launch.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
];

const MAX_PAGE_ENTRIES = 40;
const MAX_IMAGE_ENTRIES = 60;
const NAVIGATION_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // `addAll` rejects the whole install if one URL fails, which would leave
      // the app with no service worker at all. Add them individually instead.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // A missing optional asset must not block installation.
          }
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("isbulk-") && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      // Navigation preload lets the network fetch start before the worker has
      // decided the strategy, which removes the worker from the critical path
      // on a cold navigation.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

/** Trim a cache to the newest `max` entries. Cache keys are insertion-ordered. */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - max;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

/**
 * Responses that must never enter a cache, whatever the strategy.
 *
 * The RSC checks matter as much as the path checks: Next fetches the router
 * payload for a prefetched or navigated route from the *same* URL, so a rule
 * that only looked at the pathname would happily store the private dashboard
 * payload under a public-looking key.
 */
function isUncacheable(request, url) {
  if (request.method !== "GET") return true;
  if (!isSameOrigin(url)) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/auth/")) return true;
  if (url.searchParams.has("_rsc")) return true;
  if (request.headers.get("RSC") === "1") return true;
  if (request.headers.get("Next-Router-Prefetch") === "1") return true;
  if (request.headers.get("Next-Router-State-Tree")) return true;
  return false;
}

function isHashedAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isImageRequest(request, url) {
  if (request.destination === "image") return true;
  return url.pathname.startsWith("/_next/image");
}

async function networkFirstNavigation(event) {
  const cache = await caches.open(PAGES);
  const preload = await event.preloadResponse;
  if (preload) {
    // Only a real HTML document is worth storing; an error page or a redirect
    // must not become the offline copy of the route.
    if (preload.ok && (preload.headers.get("content-type") ?? "").includes("text/html")) {
      await cache.put(event.request, preload.clone());
      await trimCache(PAGES, MAX_PAGE_ENTRIES);
    }
    return preload;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
    const response = await fetch(event.request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok && (response.headers.get("content-type") ?? "").includes("text/html")) {
      await cache.put(event.request, response.clone());
      await trimCache(PAGES, MAX_PAGE_ENTRIES);
    }
    return response;
  } catch {
    const cached = await cache.match(event.request, { ignoreSearch: false });
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trimCache(cacheName, maxEntries);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(IMAGES);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
        await trimCache(IMAGES, MAX_IMAGE_ENTRIES);
      }
      return response;
    })
    .catch(() => null);
  return cached ?? (await network) ?? new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isUncacheable(request, url)) return;

  if (request.mode === "navigate" && request.destination === "document") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS, 200));
    return;
  }

  if (isImageRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else (RSC payloads that reach here, POSTs, cross-origin) is left
  // to the network untouched.
});

/**
 * The page asks for an immediate update by posting `{ type: "SKIP_WAITING" }`
 * after it has told the visitor an update is ready. Activation is never forced
 * from inside the worker, so a reload can never be triggered mid-form.
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ------------------------------------------------------------------ *
 * Web Push
 * ------------------------------------------------------------------ */

/**
 * iOS Safari delivers push only to an *installed* home-screen app, and requires
 * that the notification is displayed from the push handler itself — a silent
 * push that only updates state is dropped. So every push event here ends in
 * `showNotification`, with a safe fallback payload when the body is missing.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "İşBul KKTC";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // Only same-origin, relative destinations are honoured. A push payload is
    // server-controlled, but treating it as untrusted keeps a compromised or
    // misconfigured sender from opening an arbitrary origin.
    data: {
      url:
        typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//")
          ? payload.url
          : "/",
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
    },
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if ("setAppBadge" in navigator && Number.isInteger(payload.badgeCount)) {
        try {
          if (payload.badgeCount > 0) {
            await navigator.setAppBadge(payload.badgeCount);
          } else {
            await navigator.clearAppBadge();
          }
        } catch {
          // Badging is not supported everywhere; it is never worth failing on.
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).toString();

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse an open tab on this origin instead of stacking a second one; an
      // installed app that opens a new window per notification feels broken.
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              // Older engines cannot navigate a client; focusing is enough.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/** Browsers use this to close stale subscriptions; the server cleans up on send. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const subscription = await self.registration.pushManager.subscribe(
        event.oldSubscription
          ? event.oldSubscription.options
          : { userVisibleOnly: true },
      );
      await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    })(),
  );
});
