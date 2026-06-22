import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChallengeBankScreen } from "./ChallengeBankScreen";

const meta = {
  title: "Écrans/ChallengeBankScreen",
  component: ChallengeBankScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    onPropose: fn(),
    onAdd: fn(),
    onUpdate: fn(),
    onDelete: fn(),
    onSetHidden: fn(),
    onBack: fn(),
  },
} satisfies Meta<typeof ChallengeBankScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  args: {
    suggestions: [
      { id: "1", title: "The forbidden word", description: "A single suggestive text.", intensity: "soft", isOwn: false },
      { id: "2", title: "Oil massage", description: "An hour just for the other.", intensity: "hot", isOwn: false },
      { id: "3", title: "Our ritual", description: "An idea that's all ours.", intensity: "hot", isOwn: true },
    ],
  },
  render: (args) => (
    <div className="w-[380px]">
      <ChallengeBankScreen {...args} />
    </div>
  ),
};

/** « Déjà fait » (✓ #69) et idée masquée (grisée, #70). */
export const FaitEtMasqué: Story = {
  name: "Déjà fait + masqué",
  args: {
    suggestions: [
      { id: "1", title: "The forbidden word", description: "A single suggestive text.", intensity: "soft", isOwn: false, done: true },
      { id: "2", title: "Oil massage", description: "An hour just for the other.", intensity: "hot", isOwn: false, hidden: true },
      { id: "3", title: "Our ritual", description: "An idea that's all ours.", intensity: "hot", isOwn: true },
    ],
  },
  render: (args) => (
    <div className="w-[380px]">
      <ChallengeBankScreen {...args} />
    </div>
  ),
};
