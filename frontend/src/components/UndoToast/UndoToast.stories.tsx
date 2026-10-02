import type { Meta, StoryObj } from "@storybook/react-vite";
import { UndoToast } from "./UndoToast";

const meta = {
  title: "Feedback/UndoToast",
  component: UndoToast,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Toast éphémère avec action « Annuler », ancré en bas. Le minuteur est en pause au survol/focus.",
      },
    },
  },
  args: {
    message: "« Un massage » retiré",
    actionLabel: "Annuler",
    duration: 0,
    onAction: () => {},
    onDismiss: () => {},
  },
  argTypes: { onAction: { action: "annuler" }, onDismiss: { action: "fermé" } },
} satisfies Meta<typeof UndoToast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};
