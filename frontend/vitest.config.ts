import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config de test isolée de `vite.config.ts` : on ne charge que le plugin React
// (pas le plugin PWA, inutile et bruyant en test). jsdom pour les composants.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // `isolate: false` a été essayé pour amortir le coût de recréation de
    // jsdom par fichier (~55-60% du temps de la suite, mesuré) : passe en
    // local (macOS, plus de workers → moins de fichiers partagés par
    // worker), mais casse en CI (moins de CPU disponibles → plus de fichiers
    // par worker → les `vi.mock("../api/client", ...)` de fichiers
    // différents, qui remplacent le module par des formes différentes,
    // finissent par se marcher dessus dans un même worker — repro réel :
    // run #2695, SpaceApp.test.tsx + useApiBuild.test.ts cassés alors que
    // 303/303 passaient en local). Non déterministe (dépend du nombre de
    // CPU du runner) → abandonné, pas de fix sûr sans revoir la stratégie de
    // mock de ces fichiers.
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
        lines: 75,
        statements: 74,
        branches: 68,
        functions: 70,
      },
    },
  },
});
