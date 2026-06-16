import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChallengeBankScreen } from "./ChallengeBankScreen";

const meta = {
  title: "Écrans/ChallengeBankScreen",
  component: ChallengeBankScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { onAdd: fn(), onUpdate: fn(), onDelete: fn(), onBack: fn() },
} satisfies Meta<typeof ChallengeBankScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  args: {
    suggestions: [
      { id: "1", title: "Le mot interdit", description: "Un seul SMS suggestif.", intensity: "soft", isOwn: false },
      { id: "2", title: "Massage aux huiles", description: "Une heure rien que pour l'autre.", intensity: "hot", isOwn: false },
      { id: "3", title: "Notre rituel", description: "Une idée rien qu'à nous.", intensity: "hot", isOwn: true },
    ],
  },
  render: (args) => (
    <div className="w-[380px]">
      <ChallengeBankScreen {...args} />
    </div>
  ),
};
