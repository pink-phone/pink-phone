// Polices chargées hors-ligne via @fontsource (aucun CDN). Importées depuis le JS
// et non par @import dans index.css : depuis Tailwind 4, @tailwindcss/postcss
// inline les @import sans réécrire les url() des @font-face (restées relatives
// à `@fontsource/*/files/`) → aucune police n'était émise dans le build. Vite
// résout et copie correctement les fichiers quand le CSS est importé ici.
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
