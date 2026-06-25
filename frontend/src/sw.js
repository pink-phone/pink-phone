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

// ---- Partage natif → nouveau post (Web Share Target, #86/#87) ----
// L'OS POSTe le(s) média(s) partagé(s) sur /share-target. On les met en cache
// et on redirige vers l'app, qui les récupère puis ouvre le composer avec la
// galerie pré-remplie. Plusieurs fichiers sont supportés (galerie, #87) :
//   GET /__shared-media       → manifeste JSON { count }
//   GET /__shared-media/<i>   → le i-ème fichier (header X-Share-Filename)
// (Android Chrome ; iOS Safari ne supporte pas le share *target*.)
const SHARE_CACHE = "pp-share";
const SHARE_KEY = "/__shared-media";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleSharedPost(event.request));
  } else if (
    event.request.method === "GET" &&
    (url.pathname === SHARE_KEY || url.pathname.startsWith(SHARE_KEY + "/"))
  ) {
    event.respondWith(
      caches
        .open(SHARE_CACHE)
        .then((c) => c.match(url.pathname))
        .then((res) => res || new Response(null, { status: 404 })),
    );
  }
});

async function handleSharedPost(request) {
  try {
    const form = await request.formData();
    // L'OS envoie tous les médias sous le même champ « media » → getAll.
    const files = form.getAll("media").filter((f) => f && f.size > 0);
    if (files.length > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await Promise.all(
        files.map((file, i) =>
          cache.put(
            `${SHARE_KEY}/${i}`,
            new Response(file, {
              headers: {
                "Content-Type": file.type || "application/octet-stream",
                "X-Share-Filename": encodeURIComponent(file.name || "media"),
              },
            }),
          ),
        ),
      );
      // Manifeste : combien de fichiers l'app doit récupérer.
      await cache.put(
        SHARE_KEY,
        new Response(JSON.stringify({ count: files.length }), {
          headers: { "Content-Type": "application/json" },
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
