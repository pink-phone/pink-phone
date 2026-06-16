import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ContextMenu } from "./ContextMenu";

const meta = {
  title: "Communs/ContextMenu",
  component: ContextMenu,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { ariaLabel: "Actions" },
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ModifierSupprimer: Story = {
  args: {
    items: [
      { label: "Modifier", onClick: fn() },
      { label: "Supprimer", onClick: fn(), danger: true },
    ],
  },
};
