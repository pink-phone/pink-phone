import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { InstallBanner } from "./InstallBanner";

const meta = {
  title: "PWA/InstallBanner",
  component: InstallBanner,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { mode: "android", onInstall: fn(), onDismiss: fn() },
} satisfies Meta<typeof InstallBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Android: Story = { args: { mode: "android" } };
export const Ios: Story = { args: { mode: "ios" } };
