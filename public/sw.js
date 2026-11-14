/* KING DAY service worker.
 *
 * What it caches: only public, versioned static files (Next.js build assets with
 * hashed names, app icons) and the offline page.
 * What it never caches: HTML pages, data requests, anything under account, cart,
 * checkout, admin, staff, invoices, auth or API routes, and any other website
 * (Supabase, payments, maps). Those always go straight to the network, so private
 * customer data and payment details are never stored on the device by this worker.
 *
 * Updates: a new version installs in the background and waits. The page shows
 * "Update available"; when the user taps it, the page posts SKIP_WAITING and reloads.
 */

const VERSION = "kd-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png"];

// Never intercepted, never cached.
const PRIVATE_PREFIXES = [
  "/api/",
  "/auth/",
  "/admin",
  "/staff",
  "/account",
  "/cart",
  "/service-cart",
  "/service-invoice",
  "/checkout",
  "/login",
  "/register",
  "/reset-password",
  "/forgot-password",
  "/wishlist",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("kd-") && k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isPrivate(url) {
  return PRIVATE_PREFIXES.some((p) => {
    const base = p.replace(/\/$/, "");
    return url.pathname === base || url.pathname.startsWith(`${base}/`);
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, payments, maps: untouched

  // Page navigations (any page, including account pages): always fresh from the
  // network and never stored; the offline page is shown only if there's no connection.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
    return;
  }
  if (isPrivate(url)) return;

  // Hashed build assets and app icons never change: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Everything else (data, images, server components): network only.
});

// ---------------------------------------------------------------- Push notifications
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "KING DAY", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(data.title || "KING DAY", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(target.href);
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
