import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MoodSelector } from "./MoodSelector";
import { MOODS, type MoodId } from "./moods";
import { Surface } from "../Surface/Surface";

const meta = {
  title: "Mood/MoodSelector",
  component: MoodSelector,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "La « météo sexuelle » : un coup d'œil pour savoir où en est le/la partenaire. L'état actif reçoit un soft glow.",
      },
    },
  },
  argTypes: { onChange: { action: "mood changé" } },
} satisfies Meta<typeof MoodSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  args: { value: "veryHot" },
};

export const Interactif: Story = {
  render: (args) => {
    const [value, setValue] = useState<string | null>(null);
    return (
      <MoodSelector
        {...args}
        value={value}
        onChange={(m) => {
          setValue(m);
          args.onChange?.(m);
        }}
      />
    );
  },
};

/** Humeur libre (emoji custom) active : le bouton « + » devient l'humeur choisie. */
export const MoodLibre: Story = {
  name: "Humeur libre (emoji custom)",
  args: { value: "🥰" },
};

const label = (id: MoodId) => MOODS.find((m) => m.id === id)!;

export const DashboardDuCouple: Story = {
  name: "Sur le dashboard (les deux moods)",
  render: () => (
    <Surface tone="velvet" className="w-80">
      <h2 className="mb-4 text-center font-serif text-xl text-blush-100">
        Aujourd'hui
      </h2>
      <div className="space-y-4">
        {(
          [
            { who: "Toi", id: "veryHot" as MoodId, when: "il y a 2 h" },
            { who: "Camille", id: "cuddleNeeded" as MoodId, when: "il y a 10 min" },
          ]
        ).map(({ who, id, when }) => (
          <div key={who} className="flex items-center gap-3">
            <span className="text-2xl">{label(id).emoji}</span>
            <div className="leading-tight">
              <p className="text-sm text-taupe-200">{who}</p>
              <p className="text-xs text-taupe-400">
                {label(id).label} · {when}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Surface>
  ),
};
