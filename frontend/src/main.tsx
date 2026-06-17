import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import "./i18n";
import { applyTheme, getTheme } from "./theme";
import { App } from "./App";

// Applique le thème mémorisé au plus tôt (avant le rendu).
applyTheme(getTheme());

// Enregistre le service worker et, en mode autoUpdate, recharge l'app dès qu'une
// nouvelle version est déployée (sinon le CD passe mais l'utilisateur garde
// l'ancienne PWA en cache). On déclenche en plus une vérification de mise à jour
// au retour de focus de l'app : un nouveau SW (skipWaiting dans sw.js) s'active
// et autoUpdate recharge la page. Throttle pour ne pas vérifier à chaque focus.
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
