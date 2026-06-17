import type { Meta, StoryObj } from "@storybook/react-vite";
import { Splash } from "./Splash";

const meta = {
  title: "Écrans/Splash",
  component: Splash,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Splash>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};
