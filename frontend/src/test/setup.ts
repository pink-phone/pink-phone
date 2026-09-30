import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// Initialise i18next (les composants appellent `useTranslation`/`t`). On force le
// français pour des assertions déterministes (langue source du dictionnaire).
import i18n from "../i18n";

void i18n.changeLanguage("fr");

// jsdom n'implémente pas `matchMedia` (utilisé par InstallPrompt et
// MediaLightbox pour l'orientation) — stub minimal, jamais "matching" par
// défaut (les tests qui en ont besoin simulent eux-mêmes `.matches`).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom n'implémente pas non plus `ResizeObserver` (MediaLightbox mesure sa
// zone centrale pour la rotation) — stub muet, aucun test n'a besoin d'une
// vraie mesure de layout (jsdom ne fait pas de layout de toute façon).
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
