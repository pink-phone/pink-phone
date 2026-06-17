/** @type {import('tailwindcss').Config} */
// DA "Pink Phone" — Skeuomorphisme feutré (felted).
// Pas de flat froid, pas de rose "bonbon". Surfaces douces, roses désaturés, neutres chauds.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Palette thématisable : les canaux RGB vivent en variables CSS
      // (src/index.css : :root = thème "felted", [data-theme=…] = autres thèmes).
      // `<alpha-value>` préserve les modificateurs d'opacité (ex: bg-spice-500/40).
      colors: {
        blush: {
          50: "rgb(var(--blush-50) / <alpha-value>)",
          100: "rgb(var(--blush-100) / <alpha-value>)",
          200: "rgb(var(--blush-200) / <alpha-value>)",
          300: "rgb(var(--blush-300) / <alpha-value>)",
        },
        spice: {
          300: "rgb(var(--spice-300) / <alpha-value>)",
          400: "rgb(var(--spice-400) / <alpha-value>)",
          500: "rgb(var(--spice-500) / <alpha-value>)",
          600: "rgb(var(--spice-600) / <alpha-value>)",
        },
        bordeaux: {
          500: "rgb(var(--bordeaux-500) / <alpha-value>)",
          600: "rgb(var(--bordeaux-600) / <alpha-value>)",
          700: "rgb(var(--bordeaux-700) / <alpha-value>)",
        },
        charcoal: {
          900: "rgb(var(--charcoal-900) / <alpha-value>)",
          800: "rgb(var(--charcoal-800) / <alpha-value>)",
          700: "rgb(var(--charcoal-700) / <alpha-value>)",
          600: "rgb(var(--charcoal-600) / <alpha-value>)",
        },
        taupe: {
          100: "rgb(var(--taupe-100) / <alpha-value>)",
          200: "rgb(var(--taupe-200) / <alpha-value>)",
          300: "rgb(var(--taupe-300) / <alpha-value>)",
          400: "rgb(var(--taupe-400) / <alpha-value>)",
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
        glow: "0 0 16px -2px rgb(var(--spice-500) / 0.55)", // soft glow (Mood actif)
        // Braise : halo chaud (états "hot") — spice + bordeaux profond
        ember:
          "0 0 18px -2px rgb(var(--spice-400) / 0.55), 0 0 36px -6px rgb(var(--bordeaux-600) / 0.5)",
      },
      backgroundImage: {
        // Textures subtiles (velours / lin feutré) — bruit doux non agressif
        "felt-velvet":
          "radial-gradient(circle at 30% 20%, rgb(var(--spice-500) / 0.08), transparent 60%), radial-gradient(circle at 80% 80%, rgb(var(--bordeaux-600) / 0.10), transparent 55%)",
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
        // Halo de braise qui respire (états "hot")
        "ember-breathe": {
          "0%, 100%": {
            boxShadow:
              "0 0 10px -2px rgb(var(--spice-400) / 0.35), 0 0 20px -6px rgb(var(--bordeaux-600) / 0.35)",
          },
          "50%": {
            boxShadow:
              "0 0 22px 0px rgb(var(--spice-400) / 0.7), 0 0 44px -4px rgb(var(--bordeaux-600) / 0.55)",
          },
        },
        // Particule de feu qui s'élève et s'éteint
        "ember-rise": {
          "0%": { transform: "translateY(0) scale(1)", opacity: "0" },
          "20%": { opacity: "0.85" },
          "100%": { transform: "translateY(-42px) scale(0.3)", opacity: "0" },
        },
      },
      animation: {
        // Apparitions douces — pas de popups agressifs
        "fade-in": "fade-in 0.35s cubic-bezier(0.22,0.61,0.36,1) both",
        "slide-up": "slide-up 0.4s cubic-bezier(0.22,0.61,0.36,1) both",
        // Braise (états "hot")
        "ember-breathe": "ember-breathe 3.6s ease-in-out infinite",
        "ember-rise": "ember-rise 2.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};
