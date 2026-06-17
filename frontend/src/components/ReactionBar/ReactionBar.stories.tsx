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
          "Réactions rapides « sans jugement » sous un post. Trois états : ma réaction (fond plein + soft glow), réaction de l'autre (liseré spice, fond neutre), aucune (neutre). Un appui pose ou retire la sienne.",
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

/** Réactions posées par l'autre (liseré spice) vs la mienne (fond plein). */
export const RéactionsDeLAutre: Story = {
  name: "Réactions de l'autre (liseré spice)",
  args: {
    counts: { heart: 1, fire: 1, smirk: 2 },
    mine: ["heart"],
  },
  parameters: {
    docs: {
      description: {
        story:
          "❤️ est ma réaction (fond plein). 🔥 et 😏 ont été posées par l'autre : liseré spice, sans fond plein, pour les distinguer des miennes.",
      },
    },
  },
};

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
