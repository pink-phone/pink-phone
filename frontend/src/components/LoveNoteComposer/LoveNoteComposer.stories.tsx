import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoveNoteComposer } from "./LoveNoteComposer";

const meta = {
  title: "MotsDoux/LoveNoteComposer",
  component: LoveNoteComposer,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "padded" },
  argTypes: { onSend: { action: "envoyer" }, onSent: { action: "envoyé" } },
  args: { onSend: () => true },
} satisfies Meta<typeof LoveNoteComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};
