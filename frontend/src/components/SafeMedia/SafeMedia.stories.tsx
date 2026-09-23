import type { Meta, StoryObj } from "@storybook/react-vite";
import { SafeMedia } from "./SafeMedia";

// Image neutre de démo (pas de contenu explicite dans Storybook).
const DEMO_SRC =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=70";

// Vidéo neutre de démo (échantillon public, non explicite).
const DEMO_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

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

export const Téléchargeable: Story = {
  args: { downloadable: true, downloadName: "souvenir" },
  parameters: {
    docs: {
      description: {
        story:
          "Quand le post l'autorise (#78), un bouton de téléchargement apparaît en bas à droite. Jamais affiché sur un média éphémère.",
      },
    },
  },
};

export const Vidéo: Story = {
  args: {
    src: DEMO_VIDEO,
    kind: "video",
    alt: "Vidéo intime",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Vidéo : le même geste « press-and-hold » révèle ET lit la vidéo ; on relâche pour flouter et mettre en pause (pas de contrôles natifs — la lecture reste pilotée par le geste).",
      },
    },
  },
};

export const RatioPaysage: Story = {
  name: "Ratio naturel — paysage",
  args: {
    src: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&q=70",
    alt: "Photo paysage",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Le cadre épouse le ratio d'origine (large ici) au lieu du 4:5 fixe — plus de recadrage qui donnait une impression de zoom.",
      },
    },
  },
};

export const RatioPortraitTrèsHaut: Story = {
  name: "Ratio naturel — portrait très haut (borné)",
  args: {
    src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&h=1400&q=70&fit=crop",
    alt: "Photo portrait très haute",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Un format très haut (ex. photo iPhone recadrée serrée) reste borné par `max-h-[70dvh]` pour ne pas envahir tout l'écran.",
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

export const AuthentifiéRatioConnuAvance: Story = {
  name: "Authentifié — ratio connu avant le clic",
  args: {
    src: undefined,
    loader: () =>
      new Promise<string>((resolve) => setTimeout(() => resolve(DEMO_SRC), 700)),
    width: 1200,
    height: 630,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Le backend renvoie les dimensions calculées à l'upload (`width`/`height`) : même pour un média authentifié jamais encore téléchargé, le cadre paysage est déjà correct avant tout clic — comparer avec « Authentifié (chargement paresseux) » ci-dessus, qui part en 4:5 le temps du premier press-and-hold.",
      },
    },
  },
};
