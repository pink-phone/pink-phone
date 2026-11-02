import type { Meta, StoryObj } from "@storybook/react-vite";
import { EveningMenuEntry } from "./EveningMenuEntry";

const LOTUS =
  "Assis sur les cuisses de l'autre, jambes nouées dans le dos, front contre front.";

const meta = {
  title: "Envies/EveningMenuEntry",
  component: EveningMenuEntry,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div role="list" className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Item du menu du soir (#97b, 114c) : marque d'état (MenuMark) + libellé + ligne de statut. Chaque geste a son bouton : ✕ Retirer sur mon choix ; Partant·e / Pas ce soir sur une proposition de l'autre (mode ouvert).",
      },
    },
  },
  argTypes: {
    onAccept: { action: "partant" },
    onRefuse: { action: "refuser" },
    onRemove: { action: "retirer" },
  },
  args: {
    label: "Un massage",
    picked: false,
    matched: false,
    partnerName: "Alex",
  },
} satisfies Meta<typeof EveningMenuEntry>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mon choix, mode aveugle : pas de « en attente ». */
export const MonChoix: Story = {
  args: { picked: true, onRemove: () => {} },
};

/** Mon choix, mode ouvert : « En attente de … ». */
export const MonChoixEnAttente: Story = {
  args: { picked: true, openMode: true, onRemove: () => {} },
};

export const AvecDescription: Story = {
  args: {
    label: "Le lotus",
    subcategoryLabel: "Kamasutra",
    description: LOTUS,
    picked: true,
    onRemove: () => {},
  },
};

export const Matché: Story = {
  args: {
    label: "Le lotus",
    subcategoryLabel: "Kamasutra",
    description: LOTUS,
    picked: true,
    matched: true,
    onRemove: () => {},
  },
};

/** Mode ouvert : l'autre a proposé — deux réponses de même poids. */
/** Menus dévoilés (aveugle) : « Partant·e » posé après coup → « Validé ensemble », distinct d'un match par coïncidence. */
export const ValidéEnsemble: Story = {
  args: {
    label: "Le lotus",
    subcategoryLabel: "Kamasutra",
    picked: true,
    matched: true,
    agreed: true,
    onRemove: () => {},
  },
};

export const Proposition: Story = {
  args: {
    label: "Le lotus",
    subcategoryLabel: "Kamasutra",
    description: LOTUS,
    partnerWants: true,
    matched: true,
    onAccept: () => {},
    onRefuse: () => {},
  },
};

export const Refusé: Story = {
  args: { label: "Le lotus", subcategoryLabel: "Kamasutra", picked: true, refused: true },
};
