/* NexTask Service Worker
 * - App-shell + runtime caching
 * - Web Push handler with notification click routing
 * - Background sync stub
 *
 * Bump CACHE_VERSION on any breaking change so old shells purge.
 */
const CACHE_VERSION = "nextask-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  "/",
  "/dashboard",
  "/login",
  "/manifest.webmanifest",
  "/brand/ntlogo.jpg",
];

// ────────────────────────────── Install ──────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {
        /* If any shell asset fails (offline install), still proceed */
      }),
    ),
  );
  self.skipWaiting();
});

// ────────────────────────────── Activate ─────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(CACHE_VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// ────────────────────────────── Fetch ────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache cross-origin (Supabase, Google fonts) — let browser handle
  if (url.origin !== self.location.origin) return;

  // Never cache API routes or Next.js internals
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/data/")) return;

  // Navigation requests → network-first, fall back to cached shell
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/dashboard"))),
    );
    return;
  }

  // Static assets → network-first for versioned dev assets (?v=), cache-first otherwise.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)
  ) {
    // Dev-mode assets have a ?v= cache-buster — always go network-first so HMR works.
    if (url.search.includes("v=")) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(req).then((c) => c || Response.error())),
      );
      return;
    }
    // Production immutable assets — cache-first.
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }).catch(() => Response.error()),
      ),
    );
    return;
  }
});

// ────────────────────────────── Push ─────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "NexTask", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "NexTask";
  const options = {
    body: data.body || "",
    icon: data.icon || "/brand/ntlogo.jpg",
    badge: data.badge || "/brand/ntlogo.jpg",
    tag: data.tag || "nextask-notification",
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    data: {
      url: data.url || "/dashboard",
      notificationId: data.notificationId || null,
    },
    vibrate: data.vibrate || [120, 60, 120],
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ───────────────────────── Notification click ────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing tab on the same origin
      for (const client of clients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin && "focus" in client) {
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        } catch {
          // ignore
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

// ────────────────────── Message channel (skipWaiting) ────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
