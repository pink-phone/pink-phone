import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config de test isolée de `vite.config.ts` : on ne charge que le plugin React
// (pas le plugin PWA, inutile et bruyant en test). jsdom pour les composants.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // jsdom recréé par fichier représente ~55-60% du temps de la suite
    // (mesuré, cf. sortie de vitest). `pool: 'vmThreads'` évite ça mais casse
    // `crypto.subtle` sous jsdom (contexte vm incomplet — cf. src/lib/pin.ts,
    // testé et écarté) ; `isolate: false` réutilise le jsdom du worker sans
    // ce problème, au prix d'un état (modules/mocks) partagé entre fichiers
    // d'un même worker — les tests sont écrits avec des mocks locaux au
    // fichier (vi.mock au niveau module + reset via setup.ts), donc sans
    // risque connu de fuite.
    isolate: false,
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    // Les stories ne sont pas des tests.
    exclude: ["**/node_modules/**", "**/*.stories.tsx"],
    // Couverture (#93) : seulement avec `--coverage` (npm run coverage / CI).
    // On mesure le code applicatif, pas les stories/tests/mocks/setup. Les
    // seuils sont des planchers (sous la valeur courante) → ils verrouillent
    // l'acquis sans casser le CI à la moindre fluctuation.
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "src/**/*.stories.tsx",
        "src/**/*.test.{ts,tsx}",
        "src/mock/**",
        "src/test/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/sw.js",
      ],
      reporter: ["text-summary", "lcov", "json-summary"],
      thresholds: {
        lines: 65,
        statements: 65,
        branches: 70,
        functions: 40,
      },
    },
  },
});
