import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // Storybook fusionne le vite.config.ts de l'app : on en retire vite-plugin-pwa,
  // car le service worker / précache PWA n'a aucun sens dans Storybook (et son
  // contrôle de taille de précache fait échouer le build sur les chunks Storybook).
  viteFinal: async (viteConfig) => {
    // VitePWA() renvoie un tableau de plugins : il est imbriqué dans
    // `plugins`, donc on aplatit avant de filtrer.
    viteConfig.plugins = (viteConfig.plugins ?? [])
      .flat(Infinity)
      .filter(
        (plugin) =>
          !(
            plugin &&
            typeof plugin === "object" &&
            "name" in plugin &&
            typeof plugin.name === "string" &&
            plugin.name.startsWith("vite-plugin-pwa")
          ),
      );
    return viteConfig;
  },
};

export default config;
