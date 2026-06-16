import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { App } from "./App";

// Enregistre le service worker et, en mode autoUpdate, recharge l'app dès qu'une
// nouvelle version est déployée (sinon le CD passe mais l'utilisateur garde
// l'ancienne PWA en cache).
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
