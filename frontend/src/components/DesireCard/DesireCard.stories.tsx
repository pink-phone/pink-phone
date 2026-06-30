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
          "Une envie de la bucket list (#99). Bouton « intérêt » (privé, double-aveugle : neutre/coché/matché) + bouton « ✓ Réalisé » (partagé, couple).",
      },
    },
  },
  argTypes: { onToggle: { action: "intérêt" }, onToggleDone: { action: "réalisé" } },
  args: {
    label: "Massage aux huiles",
    interested: false,
    matched: false,
    done: false,
  },
} satisfies Meta<typeof DesireCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pas encore coché : cœur creux, surface neutre. */
export const Neutre: Story = {};

/** Coché par moi seul·e : cœur plein, liseré spice — l'autre n'en sait rien. */
export const Interesse: Story = {
  args: { interested: true },
};

/** Match : les deux l'ont coché → braise + badge « Match ! ». */
export const Matche: Story = {
  args: { interested: true, matched: true },
};

/** Marqué « ✓ Réalisé » (couple) : badge + bouton réalisé actif. */
export const Realise: Story = {
  args: { interested: true, matched: true, done: true },
};
