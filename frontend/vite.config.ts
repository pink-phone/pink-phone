import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PinkPhone est distribuée en PWA (hors stores) — installable sur l'écran d'accueil.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest : on fournit notre propre service worker (gestion du push).
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "pwa-maskable-512x512.png",
      ],
      manifest: {
        id: "/",
        name: "Pink Phone",
        short_name: "Pink Phone",
        description: "Notre espace intime, à deux.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        theme_color: "#1A1719",
        background_color: "#1A1719",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
