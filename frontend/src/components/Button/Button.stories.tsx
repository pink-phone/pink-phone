import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta = {
  title: "Fondations/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost"] },
    size: { control: "inline-radio", options: ["sm", "md"] },
    onClick: { action: "click" },
  },
  args: { children: "Challenge accepted", variant: "primary", size: "md" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary", children: "Négocier" } };
export const Ghost: Story = { args: { variant: "ghost", children: "Pas cette fois" } };

export const Palette: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Principal</Button>
      <Button variant="secondary">Secondaire</Button>
      <Button variant="ghost">Discret</Button>
      <Button variant="primary" disabled>
        Désactivé
      </Button>
    </div>
  ),
};
