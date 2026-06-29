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
          "Une envie du « Dossier Noir » (#99). Trois états : neutre, coché (mon intérêt privé) et matché (l'autre l'a coché aussi → révélé).",
      },
    },
  },
  argTypes: { onToggle: { action: "toggle" } },
  args: {
    label: "Sensual massage",
    interested: false,
    matched: false,
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

/** Avec un indice sous le libellé. */
export const AvecIndice: Story = {
  args: { interested: true, description: "An hour just for the other one." },
};

/** Match : les deux l'ont coché → braise + badge « Match ! ». */
export const Matche: Story = {
  args: { interested: true, matched: true },
};
