// Bump on every release that changes the shell: `activate` deletes every cache
// whose key is not this one, which is what evicts an installed home-screen app
// off the previous build.
const CACHE = "couple-shop-v4";
/** Rotated subscriptions are parked here until a page is open to record them. */
const PUSH_CACHE = "couple-shop-push";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/assets/app-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // One missing file must not abandon the whole precache.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== PUSH_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Same-origin GETs only. Supabase traffic, push endpoints and any write must
 * never be served from a cache — a stale order list is worse than an error.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/index.html", copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "点单小铺", body: "💕 收到新的情侣订单", orderId: "", url: "" };
  try { data = { ...data, ...event.data.json() }; } catch { /* use default copy */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/assets/app-icon.png",
    badge: "/assets/app-icon.png",
    // Same order, same tag: an "accepted" notice replaces its "new order" one.
    tag: data.orderId || "couple-order",
    renotify: Boolean(data.orderId),
    // No 接单/婉拒 actions: this worker has no Supabase session and could not
    // honour them, and a button that does nothing is worse than no button.
    data: { url: data.url || (data.orderId ? `/?order=${data.orderId}` : "/?view=orders") },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/?view=orders";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const existing = clients[0];
    if (existing) {
      // navigate() rejects for a client this worker does not control.
      try {
        await existing.navigate(target);
        return existing.focus();
      } catch {
        return self.clients.openWindow(target);
      }
    }
    return self.clients.openWindow(target);
  }));
});

/**
 * The push service can retire an endpoint and hand out a new one. Nothing
 * re-subscribed before, so notifications simply stopped for good. Re-subscribe
 * here, then park the pair for the page to write to the database — the worker
 * has no session of its own.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
    if (!applicationServerKey) return;
    const next = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const cache = await caches.open(PUSH_CACHE);
    await cache.put("/__push-rotation", new Response(JSON.stringify({
      old: event.oldSubscription?.endpoint ?? null,
      next: next.toJSON(),
    })));
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "push-subscription-changed" });
  })());
});
