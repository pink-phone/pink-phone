import type { Meta, StoryObj } from "@storybook/react-vite";
import { Surface } from "./Surface";

const meta = {
  title: "Fondations/Surface",
  component: Surface,
  tags: ["autodocs"],
  argTypes: {
    tone: { control: "inline-radio", options: ["velvet", "blush", "deep"] },
  },
  args: {
    tone: "velvet",
    children: "Une surface feutrée, douce au regard.",
  },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Velvet: Story = { args: { tone: "velvet" } };
export const Blush: Story = { args: { tone: "blush" } };
export const Deep: Story = { args: { tone: "deep" } };

export const Galerie: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <Surface tone="velvet">
        <h3 className="font-serif text-lg text-blush-100">Velours</h3>
        <p className="mt-1 text-sm text-taupe-300">Surface par défaut, intime.</p>
      </Surface>
      <Surface tone="blush">
        <h3 className="font-serif text-lg">Blush Privé</h3>
        <p className="mt-1 text-sm">Pour les contenus doux mis en lumière.</p>
      </Surface>
      <Surface tone="deep">
        <h3 className="font-serif text-lg">Vin Bordelais</h3>
        <p className="mt-1 text-sm text-blush-200">Pour les états « chauds ».</p>
      </Surface>
    </div>
  ),
};
