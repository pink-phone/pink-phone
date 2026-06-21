import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config de test isolée de `vite.config.ts` : on ne charge que le plugin React
// (pas le plugin PWA, inutile et bruyant en test). jsdom pour les composants.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    // Les stories ne sont pas des tests.
    exclude: ["**/node_modules/**", "**/*.stories.tsx"],
  },
});
