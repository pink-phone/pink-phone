import type { Preview } from "@storybook/react-vite";
// Polices hors-ligne (@fontsource), comme dans l'app.
import "../src/fonts";
// Charge les tokens DA + Tailwind dans Storybook (mêmes styles que l'app).
import "../src/index.css";
// Rétablit le scroll que l'app verrouille volontairement sur le body (après index.css).
import "./storybook.css";
// Initialise i18n pour que les composants utilisant useTranslation s'affichent.
import "../src/i18n";
import { THEMES, applyTheme } from "../src/theme";

const preview: Preview = {
  // Sélecteur de thème dans la barre d'outils : valider chaque brique sous chaque thème.
  globalTypes: {
    theme: {
      description: "Thème",
      toolbar: { title: "Thème", icon: "paintbrush", items: [...THEMES], dynamicTitle: true },
    },
  },
  decorators: [
    (Story, ctx) => {
      applyTheme((ctx.globals.theme as (typeof THEMES)[number]) ?? "felted");
      return Story();
    },
  ],
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // Fond = celui du thème actif (body de index.css) : l'addon backgrounds le masquerait.
    backgrounds: { disable: true },
    // PinkPhone est mobile-first (PWA installée sur téléphone).
    viewport: {},
    layout: "centered",
  },

  initialGlobals: {
    theme: "felted",
    viewport: {
      value: "mobile1",
      isRotated: false
    }
  }
};

export default preview;
