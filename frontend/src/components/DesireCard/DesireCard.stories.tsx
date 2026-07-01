import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesireCard } from "./DesireCard";

const meta = {
  title: "Envies/DesireCard",
  component: DesireCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Une envie de la bucket list (#99). 3 états perso (neutre / ♥ envie / 🚫 contre) — l'envie est double-aveugle (révélée en match), le contre pose une limite surfacée. + « ✓ Réalisé » partagé (couple).",
      },
    },
  },
  argTypes: {
    onToggleWant: { action: "envie" },
    onToggleAgainst: { action: "contre" },
    onToggleDone: { action: "réalisé" },
  },
  args: {
    label: "Un massage aux huiles",
    interested: false,
    matched: false,
  },
} satisfies Meta<typeof DesireCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutre: Story = {};

export const Envie: Story = {
  args: { interested: true },
};

export const Contre: Story = {
  args: { against: true, limit: true },
};

export const Limite: Story = {
  name: "Limite du partenaire",
  args: { limit: true },
};

export const Match: Story = {
  args: { interested: true, matched: true },
};

export const Realise: Story = {
  args: { interested: true, matched: true, done: true },
};
