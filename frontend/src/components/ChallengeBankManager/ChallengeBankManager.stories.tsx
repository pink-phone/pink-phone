import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChallengeBankManager } from "./ChallengeBankManager";

const meta = {
  // Non câblé dans l'app depuis #63 : la gestion de la banque est désormais
  // intégrée aux cartes de ChallengeBankScreen (⋯). Gardé pour réactivation.
  title: "Expérimental/ChallengeBankManager",
  component: ChallengeBankManager,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { suggestions: [], onAdd: fn(), onUpdate: fn(), onDelete: fn() },
} satisfies Meta<typeof ChallengeBankManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvecPropositions: Story = {
  render: (args) => (
    <div className="w-80">
      <ChallengeBankManager
        {...args}
        suggestions={[
          {
            id: "1",
            title: "Notre rituel du dimanche",
            description: "Un petit-déj au lit, sans réveil, sans écran.",
            intensity: "soft",
          },
          {
            id: "2",
            title: "Le défi maison",
            description: "Une idée rien qu'à nous, à inventer ce soir.",
            intensity: "hot",
          },
        ]}
      />
    </div>
  ),
};

export const Vide: Story = {
  render: (args) => (
    <div className="w-80">
      <ChallengeBankManager {...args} suggestions={[]} />
    </div>
  ),
};
