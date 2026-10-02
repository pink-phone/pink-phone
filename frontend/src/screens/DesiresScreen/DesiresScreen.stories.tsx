import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesiresScreen } from "./DesiresScreen";
import type { ApiDesire } from "../../api/types";

const CATALOG_LABELS: Record<string, string> = {
  tender: "Tendre & complice",
  games: "Jeux & scénarios",
  positions: "Positions",
  sensations: "Sensations",
  power: "Pouvoir & rôles",
  places: "Lieux & frissons",
  practices: "Pratiques (hot)",
};

// [code, category, libellé, intensité]
const CATALOG: Array<[string, string, string, "soft" | "hot"]> = [
  ["morningCuddle", "tender", "Un réveil câlin", "soft"],
  ["oilMassage", "tender", "Un massage aux huiles", "soft"],
  ["roleplay", "games", "Un jeu de rôle", "soft"],
  ["kamasutra-missionary", "positions", "Missionnaire", "soft"],
  ["kamasutra-doggy-style", "positions", "Levrette", "hot"],
  ["blindfold", "sensations", "À l'aveugle (bandeau)", "soft"],
  ["gentleDomination", "power", "Domination douce", "hot"],
  ["hotel", "places", "Un hôtel, un week-end", "soft"],
  ["fellatio", "practices", "Fellation", "hot"],
  ["anal", "practices", "Sodomie", "hot"],
];

const d = (over: Record<string, Partial<ApiDesire>> = {}): ApiDesire[] =>
  CATALOG.map(([code, category, label, intensity]) => ({
    code,
    category,
    categoryLabelFr: CATALOG_LABELS[category],
    categoryLabelEn: CATALOG_LABELS[category],
    subcategory: null,
    labelFr: label,
    labelEn: label,
    labelFrSoft: null,
    labelEnSoft: null,
    descriptionFr: null,
    descriptionEn: null,
    intensity,
    interested: false,
    against: false,
    matched: false,
    limit: false,
    done: false,
    ...over[code],
  }));

const meta = {
  title: "Écrans/DesiresScreen",
  component: DesiresScreen,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Bucket list (#99) : envies par catégorie (repliables). 3 états (envie/neutre/contre) + « ✓ Réalisé ». Registre explicite/suggestif.",
      },
    },
  },
  argTypes: {
    onToggleWant: { action: "envie" },
    onToggleAgainst: { action: "contre" },
    onToggleDone: { action: "réalisé" },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto min-h-dvh max-w-md bg-charcoal-900 bg-felt-velvet px-4 py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DesiresScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Explicite: Story = {
  args: {
    explicit: true,
    items: d({
      oilMassage: { interested: true, matched: true },
      "kamasutra-missionary": { done: true },
      anal: { against: true, limit: true },
      fellatio: { limit: true },
    }),
  },
};

export const Suggestif: Story = {
  args: { explicit: false, items: d() },
};
