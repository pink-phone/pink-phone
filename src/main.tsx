import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import "./i18n";
import { App } from "./App";

// Enregistre le service worker et, en mode autoUpdate, recharge l'app dès qu'une
// nouvelle version est déployée (sinon le CD passe mais l'utilisateur garde
// l'ancienne PWA en cache).
registerSW({ immediate: true });

// Bloque le pinch-zoom sur Safari iOS en onglet (où le meta viewport
// `user-scalable=no` est ignoré). En PWA installée, le meta suffit déjà.
document.addEventListener("gesturestart", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
