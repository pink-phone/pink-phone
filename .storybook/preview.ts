import type { Preview } from "@storybook/react-vite";
// Charge les tokens DA + Tailwind dans Storybook (mêmes styles que l'app).
import "../src/index.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // Fond feutré par défaut — on conçoit dans le contexte réel (dark/charbon doux).
    backgrounds: {
      options: {
        charbon: { name: "charbon", value: "#1A1719" },
        blush: { name: "blush", value: "#FBF1F4" }
      }
    },
    // PinkPhone est mobile-first (PWA installée sur téléphone).
    viewport: {},
    layout: "centered",
  },

  initialGlobals: {
    viewport: {
      value: "mobile1",
      isRotated: false
    },

    backgrounds: {
      value: "charbon"
    }
  }
};

export default preview;
