import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Émet /version.json (version + commit du build, mêmes valeurs que celles
// embarquées dans le bundle) : signal exact et lisible sans exécuter l'app, pour
// les vérifications de déploiement (deploy.yml). Servi en no-cache (nginx
// `location /`) et hors precache du service worker (le glob par défaut n'inclut
// pas le JSON) : il reflète toujours le déploiement en cours.
function versionJson(): Plugin {
  return {
    name: "pp-version-json",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({
          version: process.env.VITE_APP_VERSION || "dev",
          commit: process.env.VITE_APP_COMMIT ?? "",
        }),
      });
    },
  };
}

// PinkPhone est distribuée en PWA (hors stores) — installable sur l'écran d'accueil.
export default defineConfig({
  plugins: [
    react(),
    versionJson(),
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
        // Cible de partage (#86) : « Partager → Pink Phone » depuis la galerie du
        // téléphone envoie le média ici ; le SW (src/sw.js) intercepte le POST,
        // met le fichier en cache et redirige vers l'app (qui ouvre le composer).
        // ⚠️ Web Share *Target* = Android Chrome ; non supporté par iOS Safari/PWA.
        share_target: {
          action: "/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            files: [{ name: "media", accept: ["image/*", "video/*"] }],
          },
        },
      },
    }),
  ],
});
