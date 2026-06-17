import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ReactionBar } from "./ReactionBar";

const meta = {
  title: "Blog/ReactionBar",
  component: ReactionBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Réactions rapides « sans jugement » sous un post. Un appui pose ou retire sa réaction ; l'état actif reçoit un soft glow.",
      },
    },
  },
  argTypes: { onToggle: { action: "toggle" } },
  args: {
    counts: { fire: 3, smirk: 1, hush: 2 },
    mine: ["fire"],
  },
} satisfies Meta<typeof ReactionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};

export const Interactif: Story = {
  render: (args) => {
    const [mine, setMine] = useState<string[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>(
      args.counts ?? {},
    );
    return (
      <ReactionBar
        {...args}
        mine={mine}
        counts={counts}
        onToggle={(r) => {
          const has = mine.includes(r);
          setMine((prev) => (has ? prev.filter((x) => x !== r) : [...prev, r]));
          setCounts((prev) => ({
            ...prev,
            [r]: Math.max(0, (prev[r] ?? 0) + (has ? -1 : 1)),
          }));
          args.onToggle?.(r);
        }}
      />
    );
  },
};

/** Avec une réaction libre (emoji custom) déjà posée par le/la partenaire. */
export const AvecRéactionLibre: Story = {
  args: {
    counts: { fire: 2, "🍑": 1, "😈": 1 },
    mine: ["🍑"],
  },
};
