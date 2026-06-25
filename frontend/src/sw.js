// Service worker PinkPhone (mode injectManifest). Précache l'app + gère le push.
/* eslint-disable no-undef */
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

// En injectManifest, vite-plugin-pwa ne peut pas injecter le comportement
// "autoUpdate" : on le branche nous-mêmes. Sans ça, un SW fraîchement déployé
// reste "en attente" et l'app continue de servir l'ancienne version en cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// ---- Partage natif → nouveau post (Web Share Target, #86) ----
// L'OS POSTe le média partagé sur /share-target. On le met en cache et on
// redirige vers l'app, qui le récupère via GET /__shared-media puis ouvre le
// composer. (Android Chrome ; iOS Safari ne supporte pas le share *target*.)
const SHARE_CACHE = "pp-share";
const SHARE_KEY = "/__shared-media";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleSharedPost(event.request));
  } else if (event.request.method === "GET" && url.pathname === SHARE_KEY) {
    event.respondWith(
      caches
        .open(SHARE_CACHE)
        .then((c) => c.match(SHARE_KEY))
        .then((res) => res || new Response(null, { status: 404 })),
    );
  }
});

async function handleSharedPost(request) {
  try {
    const form = await request.formData();
    const file = form.get("media");
    if (file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        SHARE_KEY,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Share-Filename": encodeURIComponent(file.name || "media"),
          },
        }),
      );
    }
  } catch (e) {
    // best-effort : on redirige quand même vers l'app.
  }
  // 303 → navigation GET vers l'app avec le drapeau de partage.
  return Response.redirect("/?share-target=1", 303);
}

// Réception d'une notification push (payload JSON { title, body }).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data && event.data.text() };
  }
  const title = data.title || "Pink Phone";
  const body = data.body || "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: "pinkphone",
      renotify: true,
    }),
  );
});

// Clic sur la notification : focus l'app si ouverte, sinon l'ouvre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })(),
  );
});
