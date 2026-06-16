import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { ChallengeComposer } from "./ChallengeComposer";
import { Sheet } from "../Sheet/Sheet";

const meta = {
  title: "Défis/ChallengeComposer",
  component: ChallengeComposer,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof ChallengeComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standalone: Story = {
  render: (args) => (
    <div className="w-80">
      <ChallengeComposer {...args} />
    </div>
  ),
};

/** Banque fournie (≥ 6 idées) : sous-ensemble aléatoire + bouton "Autres idées". */
export const AvecBanque: Story = {
  args: {
    suggestions: [
      { title: "Le mot interdit", description: "Un seul SMS suggestif aujourd'hui.", intensity: "soft" },
      { title: "Compliment volé", description: "Glisse-lui à l'oreille ce que tu préfères.", intensity: "soft" },
      { title: "Massage aux huiles", description: "Une heure rien que pour l'autre.", intensity: "hot" },
      { title: "Douche à deux", description: "On se savonne, sans se presser.", intensity: "hot" },
      { title: "Lettre brûlante", description: "Écris une envie jamais avouée.", intensity: "hot" },
      { title: "Soirée à l'aveugle", description: "Bandeau sur les yeux toute la soirée.", intensity: "hot" },
      { title: "Mains attachées", description: "Un foulard, l'autre mène en douceur.", intensity: "hot" },
    ],
  },
  render: (args) => (
    <div className="w-80">
      <ChallengeComposer {...args} />
    </div>
  ),
};

export const DansUneSheet: Story = {
  name: "Dans une Sheet (contexte réel)",
  render: (args) => {
    const [open, setOpen] = useState(true);
    return (
      <div className="h-dvh">
        <Sheet open={open} title="Lancer un défi" onClose={() => setOpen(false)}>
          <ChallengeComposer
            {...args}
            onSubmit={(d) => {
              args.onSubmit(d);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </Sheet>
      </div>
    );
  },
};
