import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { OnboardingScreen } from "./OnboardingScreen";

const meta = {
  title: "Écrans/OnboardingScreen",
  component: OnboardingScreen,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { onCreate: fn(), onJoin: fn(), onLogout: fn(), userName: "Alex" },
} satisfies Meta<typeof OnboardingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};
export const AvecErreur: Story = {
  args: { error: "cet espace est déjà complet" },
};
