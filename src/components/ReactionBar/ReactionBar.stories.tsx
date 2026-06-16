import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ReactionBar, type ReactionId } from "./ReactionBar";

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
    const [mine, setMine] = useState<ReactionId[]>([]);
    return (
      <ReactionBar
        {...args}
        mine={mine}
        onToggle={(r) => {
          setMine((prev) =>
            prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
          );
          args.onToggle?.(r);
        }}
      />
    );
  },
};
