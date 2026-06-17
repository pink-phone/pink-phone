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
