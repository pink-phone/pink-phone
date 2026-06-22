import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import "./i18n";
import { applyTheme, getTheme } from "./theme";
import { initClientLogging } from "./clientLog";
import { App } from "./App";

// Applique le thème mémorisé au plus tôt (avant le rendu).
applyTheme(getTheme());

// Remonte les erreurs front vers le backend (debug à distance, surtout iOS).
initClientLogging();

// Recharge la page quand un nouveau service worker prend le contrôle (après
// skipWaiting + clients.claim dans sw.js) : un déploiement s'applique alors sans
// reload manuel — sinon l'ancien index.html précaché (et ses en-têtes, ex. CSP)
// resterait servi jusqu'à un rechargement à la main. On ignore la TOUTE PREMIÈRE
// prise de contrôle (aucun contrôleur au chargement) pour ne pas recharger
// inutilement au premier lancement.
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });
}

// Enregistre le service worker. On vérifie une mise à jour au retour de focus de
// l'app : un nouveau SW (skipWaiting dans sw.js) s'active, prend le contrôle, et
// le listener ci-dessus recharge la page. Throttle pour ne pas vérifier à chaque focus.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    let lastCheck = 0;
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheck < 30_000) return;
      lastCheck = now;
      registration.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
  },
});

// Bloque le pinch-zoom sur Safari iOS en onglet (où le meta viewport
// `user-scalable=no` est ignoré). En PWA installée, le meta suffit déjà.
document.addEventListener("gesturestart", (e) => e.preventDefault());

// Au focus d'un champ, on le recentre dans sa zone scrollable pour qu'il ne
// reste pas masqué par le clavier virtuel (surtout iOS, où le clavier ne réduit
// pas `dvh`) — backlog #64. Délai laissant le clavier s'ouvrir.
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (
    el instanceof HTMLElement &&
    el.matches("input, textarea, select, [contenteditable='true']")
  ) {
    setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
