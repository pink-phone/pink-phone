import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AuthScreen } from "./AuthScreen";

const meta = {
  title: "Écrans/AuthScreen",
  component: AuthScreen,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { onSubmit: fn(), onOidcLogin: fn() },
} satisfies Meta<typeof AuthScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};
export const AvecErreur: Story = {
  args: { error: "identifiants invalides" },
};
export const EnCours: Story = { args: { busy: true } };
export const AvecSSO: Story = {
  name: "Mot de passe + SSO",
  args: { oidcEnabled: true },
};
export const SSOSeul: Story = {
  name: "SSO uniquement",
  args: { passwordEnabled: false, oidcEnabled: true },
};
