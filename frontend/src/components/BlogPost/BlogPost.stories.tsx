import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlogPost } from "./BlogPost";

const DEMO_SRC =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=70";

const meta = {
  title: "Blog/BlogPost",
  component: BlogPost,
  tags: ["autodocs"],
  // La carte est désormais pleine largeur (elle s'adapte à l'écran dans l'app) ;
  // on la contraint ici pour conserver un aperçu "carte" en Storybook.
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "La carte d'un post du blog intime : récit, média flouté optionnel, réactions et commentaires.",
      },
    },
  },
  argTypes: {
    onToggleReaction: { action: "réaction" },
    onOpenComments: { action: "commentaires" },
    onDelete: { action: "supprimer" },
    onPublish: { action: "publier" },
    onEdit: { action: "éditer" },
  },
  args: {
    author: { name: "Camille", glyph: "C" },
    timeLabel: "Hier, 23 h",
    title: "Cette idée qui me trotte…",
    body:
      "Je repensais à ce qu'on s'est murmuré l'autre soir. J'aimerais qu'on prenne le temps, sans précipitation, juste pour explorer.",
    reactionCounts: { fire: 2, smirk: 1 },
    myReactions: ["fire"],
    commentCount: 3,
  },
} satisfies Meta<typeof BlogPost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TexteSeul: Story = {};

export const AvecMédia: Story = {
  args: {
    media: { src: DEMO_SRC, alt: "Photo partagée" },
  },
};

export const MédiaÉphémère: Story = {
  args: {
    body: "Juste pour toi, et juste pour ce soir. Regarde vite. 🤫",
    media: { src: DEMO_SRC, alt: "Photo éphémère", viewOnce: true },
    title: undefined,
    commentCount: 0,
  },
};

/** Mon propre post : la corbeille de suppression apparaît dans l'en-tête. */
export const Mien: Story = {
  args: { author: { name: "Toi", glyph: "T" }, isMine: true },
};

/** Mon post, vu par le/la partenaire : accusé de lecture « ✓✓ Vu ». */
export const MienVu: Story = {
  args: { author: { name: "Toi", glyph: "T" }, isMine: true, seenByPartner: true },
};

/** Brouillon : pastille + bouton "Publier", pas d'interactions tant qu'il n'est pas publié. */
export const Brouillon: Story = {
  args: {
    author: { name: "Toi", glyph: "T" },
    title: "Note pour plus tard…",
    body: "Une idée que je garde au chaud, je la peaufine avant de te l'envoyer.",
    draft: true,
    isMine: true,
  },
};
