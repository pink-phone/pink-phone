/** @type {import('tailwindcss').Config} */
// DA "Pink Phone" — Skeuomorphisme feutré (felted).
// Pas de flat froid, pas de rose "bonbon". Surfaces douces, roses désaturés, neutres chauds.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Roses intimes (désaturés, profonds)
        blush: {
          50: "#FBF1F4", // Blush Privé — fonds de cartes très clairs
          100: "#F6E3E9",
          200: "#EFD0DA",
          300: "#E3B4C2",
        },
        spice: {
          // Rose Épicé — couleur d'accent principale (boutons)
          300: "#D98DA1",
          400: "#C97187",
          500: "#B85C72", // accent par défaut
          600: "#9E4A60",
        },
        bordeaux: {
          // Vin Bordelais — titres importants / états actifs "chauds"
          500: "#7A2740",
          600: "#651F33",
          700: "#511829",
        },
        // Neutres feutrés
        charcoal: {
          900: "#1A1719", // Charbon Doux — fond appli (dark, repose les yeux)
          800: "#221E20",
          700: "#2B2629",
          600: "#3A3337",
        },
        taupe: {
          100: "#E9E1E3",
          200: "#D8CCCF", // Taupe Chaud — zones de texte
          300: "#B7A8AC",
          400: "#8C7C81",
        },
      },
      fontFamily: {
        // Titres : serif élégante haut contraste — l'élégance du murmure
        serif: ['"Playfair Display"', "Georgia", "serif"],
        // Corps : sans-serif ronde et chaleureuse, lisible sans être clinique
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        // Pas d'angles droits agressifs — arrondi généreux partout
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        // Ombres portées très douces pour la profondeur "feutrée"
        felt: "0 2px 8px -2px rgba(0,0,0,0.35), 0 8px 28px -8px rgba(0,0,0,0.45)",
        "felt-sm": "0 1px 4px -1px rgba(0,0,0,0.3)",
        glow: "0 0 16px -2px rgba(184,92,114,0.55)", // soft glow (Mood actif)
      },
      backgroundImage: {
        // Textures subtiles (velours / lin feutré) — bruit doux non agressif
        "felt-velvet":
          "radial-gradient(circle at 30% 20%, rgba(184,92,114,0.08), transparent 60%), radial-gradient(circle at 80% 80%, rgba(101,31,51,0.10), transparent 55%)",
        "felt-linen":
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 4px)",
      },
      transitionTimingFunction: {
        // Tout est fluide et lent — pas de mouvements brusques
        felt: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        // Apparitions douces — pas de popups agressifs
        "fade-in": "fade-in 0.35s cubic-bezier(0.22,0.61,0.36,1) both",
        "slide-up": "slide-up 0.4s cubic-bezier(0.22,0.61,0.36,1) both",
      },
    },
  },
  plugins: [],
};
