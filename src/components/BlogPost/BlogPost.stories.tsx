import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlogPost } from "./BlogPost";

const DEMO_SRC =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=70";

const meta = {
  title: "Blog/BlogPost",
  component: BlogPost,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "La carte d'un post du blog intime : récit, média flouté optionnel, réactions, verdict et commentaires.",
      },
    },
  },
  argTypes: {
    onToggleReaction: { action: "réaction" },
    onVerdictChange: { action: "verdict" },
    onOpenComments: { action: "commentaires" },
  },
  args: {
    author: { name: "Camille", glyph: "C" },
    timeLabel: "Hier, 23 h",
    title: "Cette idée qui me trotte…",
    body:
      "Je repensais à ce qu'on s'est murmuré l'autre soir. J'aimerais qu'on prenne le temps, sans précipitation, juste pour explorer.",
    reactionCounts: { fire: 2, smirk: 1 },
    myReactions: ["fire"],
    verdict: "curious",
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
    verdict: null,
  },
};
