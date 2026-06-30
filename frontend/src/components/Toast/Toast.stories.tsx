import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toast } from "./Toast";

const meta = {
  title: "Communs/Toast",
  component: Toast,
  parameters: { layout: "fullscreen" },
  argTypes: { onDismiss: { action: "fermer" } },
  decorators: [
    (Story) => (
      <div className="relative min-h-[200px] bg-charcoal-900 bg-felt-velvet">
        <Story />
      </div>
    ),
  ],
  args: { message: "✨ Match ce soir !", duration: 0 },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};

export const AvecIcône: Story = {
  args: { icon: "✨", message: "Match ce soir !" },
};
