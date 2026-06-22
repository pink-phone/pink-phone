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
      },
    ],
  },
} satisfies Meta<typeof CommentsSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};
export const Vide: Story = { args: { comments: [] } };
export const Chargement: Story = { args: { comments: [], loading: true } };
export const MessagesPlusAnciens: Story = {
  name: "Avec « plus anciens »",
  args: { hasMore: true, onLoadMore: fn() },
};
