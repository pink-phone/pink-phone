import type { Meta, StoryObj } from "@storybook/react-vite";
import { FireEmbers } from "./FireEmbers";

const meta = {
  title: "Effets/FireEmbers",
  component: FireEmbers,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Overlay de braises montantes pour les états « hot ». À poser dans un conteneur `relative` (halo `shadow-ember` + `animate-ember-breathe` en complément). Décoratif et désactivé sous prefers-reduced-motion.",
      },
    },
  },
  argTypes: {
    count: { control: { type: "range", min: 2, max: 12, step: 1 } },
  },
  args: { count: 6 },
} satisfies Meta<typeof FireEmbers>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Sur une "carte chaude" : halo qui respire + braises. */
export const SurCarte: Story = {
  render: (args) => (
    <div className="relative flex h-44 w-64 items-center justify-center overflow-hidden rounded-3xl border border-spice-500/40 bg-bordeaux-700 bg-felt-velvet shadow-ember animate-ember-breathe">
      <FireEmbers {...args} />
      <span className="relative z-10 font-serif text-lg text-blush-100">
        🔥 Très chaud·e
      </span>
    </div>
  ),
};

/** Sur une petite pastille (réaction). */
export const SurPastille: Story = {
  args: { count: 4 },
  render: (args) => (
    <div className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-spice-500/70 bg-bordeaux-700 px-3 py-1 text-sm text-blush-100 shadow-ember animate-ember-breathe">
      <FireEmbers {...args} />
      <span className="relative z-10 text-base leading-none">🔥</span>
    </div>
  ),
};
