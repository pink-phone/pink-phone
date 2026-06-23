import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CommentsSheet } from "./CommentsSheet";

const meta = {
  title: "Blog/CommentsSheet",
  component: CommentsSheet,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: fn(),
    onAdd: fn(),
    onEdit: fn(),
    onDelete: fn(),
    comments: [
      {
        id: "1",
        authorName: "Camille",
        body: "J'adore cette idée. On en reparle ce soir ?",
        timeLabel: "il y a 10 min",
      },
      {
        id: "2",
        authorName: "Toi",
        body: "Avec plaisir 😏",
        timeLabel: "à l'instant",
        // Mon commentaire : menu ⋯ « Modifier / Supprimer ».
        isMine: true,
      },
    ],
  },
} satisfies Meta<typeof CommentsSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};

export const AvecNonLus: Story = {
  name: "Avec ligne « non lus »",
  args: {
    comments: [
      {
        id: "1",
        authorName: "Camille",
        body: "Un mot d'hier soir.",
        timeLabel: "hier",
      },
      {
        id: "2",
        authorName: "Toi",
        body: "Ma réponse.",
        timeLabel: "hier",
        isMine: true,
      },
      // Les non-lus (de l'autre, plus récents) en bas → ligne juste au-dessus.
      {
        id: "3",
        authorName: "Camille",
        body: "Et ça, tu ne l'as pas encore vu 😏",
        timeLabel: "à l'instant",
        unread: true,
      },
    ],
  },
};

export const Vide: Story = { args: { comments: [] } };
export const Chargement: Story = { args: { comments: [], loading: true } };
export const MessagesPlusAnciens: Story = {
  name: "Avec « plus anciens »",
  args: { hasMore: true, onLoadMore: fn() },
};
