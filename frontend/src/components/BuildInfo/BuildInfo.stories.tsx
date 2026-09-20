import type { Meta, StoryObj } from "@storybook/react-vite";
import { BuildInfo } from "./BuildInfo";

const SHA = "432f3f5abcdef0123456789abcdef0123456789a";
const SHA_GH = "9a8b7c6d5e4f30211234567890abcdef12345678";

const meta = {
  title: "Settings/BuildInfo",
  component: BuildInfo,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Version de l'application (bundle web) et du serveur (API) + commit source, dans « À propos ». Le préfixe `gh-` marque un build GitHub ; le SHA raccourci permet de retrouver les sources. Un avertissement apparaît si le bundle (souvent en cache via le service worker) et l'API ne sont pas sur le même build.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md rounded-2xl bg-charcoal-800 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BuildInfo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Déploiement interne (Forgejo) : web et API sur le même build. */
export const Forgejo: Story = {
  args: {
    web: { version: "0.0.147", commit: SHA },
    api: { version: "0.0.147", commit: SHA },
  },
};

/** Image publique (GitHub / Docker Hub) : préfixe `gh-`. */
export const GitHub: Story = {
  args: {
    web: { version: "gh-1.4.0", commit: SHA_GH },
    api: { version: "gh-1.4.0", commit: SHA_GH },
  },
};

/** Version de l'API en cours de chargement. */
export const ApiEnChargement: Story = {
  args: {
    web: { version: "0.0.147", commit: SHA },
    api: "loading",
  },
};

/** API injoignable : on affiche quand même la version du bundle. */
export const ApiIndisponible: Story = {
  args: {
    web: { version: "0.0.147", commit: SHA },
    api: "unavailable",
  },
};

/** Bundle en cache d'une ancienne version face à une API redéployée. */
export const VersionsDifferentes: Story = {
  args: {
    web: { version: "0.0.146", commit: "b7e1cb1abcdef0123456789abcdef0123456789" },
    api: { version: "0.0.147", commit: SHA },
  },
};

/** Build local (`npm run dev`, Storybook) : « dev », pas de commit, jamais d'alerte. */
export const Dev: Story = {
  args: {
    web: { version: "dev", commit: "" },
    api: { version: "dev", commit: "" },
  },
};
