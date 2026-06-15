import type { Meta, StoryObj } from "@storybook/react-vite";
import { SafeMedia } from "./SafeMedia";

// Image neutre de démo (pas de contenu explicite dans Storybook).
const DEMO_SRC =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=70";

const meta = {
  title: "Sécurité/SafeMedia",
  component: SafeMedia,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Média flouté par défaut. On maintient le clic/le doigt (ou Espace/Entrée au clavier) pour révéler. La révélation est un geste, pas un simple toggle — la sécurité reste sensuelle.",
      },
    },
  },
  args: {
    src: DEMO_SRC,
    alt: "Photo intime",
    viewOnce: false,
  },
  argTypes: {
    onReveal: { action: "revealed" },
  },
} satisfies Meta<typeof SafeMedia>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FloutéParDéfaut: Story = {};

export const Éphémère: Story = {
  name: "Éphémère (View once)",
  args: { viewOnce: true },
  parameters: {
    docs: {
      description: {
        story:
          "Après une première révélation puis relâchement, le média se consume et affiche l'état « envolé ».",
      },
    },
  },
};

export const ÉphémèreConsommé: Story = {
  name: "Éphémère déjà consommé",
  args: { viewOnce: true, consumed: true },
  parameters: {
    docs: {
      description: {
        story:
          "État « envolé » restitué dès le montage (média éphémère consommé côté serveur) : persiste après un rechargement, sans tenter de charger un fichier supprimé.",
      },
    },
  },
};

export const AuthentifiéLazy: Story = {
  name: "Authentifié (chargement paresseux)",
  args: {
    src: undefined,
    loader: () =>
      new Promise<string>((resolve) => setTimeout(() => resolve(DEMO_SRC), 700)),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Avec `loader`, le média n'est chargé qu'à la première révélation (cas du média authentifié, streamé après vérif d'appartenance au space).",
      },
    },
  },
};
