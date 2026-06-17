import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TextField } from "./TextField";
import { TextArea } from "./TextArea";
import { Toggle } from "./Toggle";
import { IntensityPicker } from "./IntensityPicker";
import type { Intensity } from "../ChallengeCard/challenge";

// Vitrine des contrôles de formulaire feutrés (utilisés par les composers).
const meta = {
  title: "Fondations/Form controls",
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Champs: Story = {
  render: () => (
    <div className="w-80 space-y-4">
      <TextField label="Titre" placeholder="Cette idée qui me trotte…" />
      <TextArea label="Récit" placeholder="Raconte…" hint="Markdown léger bientôt." />
    </div>
  ),
};

export const Interrupteur: Story = {
  render: () => {
    const [on, setOn] = useState(false);
    return (
      <div className="w-80">
        <Toggle
          checked={on}
          onChange={setOn}
          label="Éphémère (view once)"
          hint="Le média disparaît après une lecture."
        />
      </div>
    );
  },
};

export const Intensité: Story = {
  render: () => {
    const [value, setValue] = useState<Intensity>("hot");
    return (
      <div className="w-80">
        <IntensityPicker value={value} onChange={setValue} />
      </div>
    );
  },
};
