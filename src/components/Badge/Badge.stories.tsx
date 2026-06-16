import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";

const meta = {
  title: "Fondations/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["soft", "hot", "hard", "neutral", "accent"],
    },
  },
  args: { children: "Hot", tone: "hot" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Intensités: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge tone="soft">Soft</Badge>
      <Badge tone="hot">Hot</Badge>
      <Badge tone="hard">Hard</Badge>
    </div>
  ),
};

export const Statuts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge tone="neutral">Proposé</Badge>
      <Badge tone="accent">En cours</Badge>
      <Badge tone="soft">Terminé</Badge>
    </div>
  ),
};
