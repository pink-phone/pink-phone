import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesiresScreen } from "./DesiresScreen";
import type { ApiDesire } from "../../api/types";

const CATALOG: Array<[string, string]> = [
  ["morningCuddle", "tender"],
  ["oilMassage", "tender"],
  ["roleplay", "games"],
  ["missionary", "positions"],
  ["doggy", "positions"],
  ["blindfold", "sensations"],
  ["gentleDomination", "power"],
  ["hotel", "places"],
  ["fellatio", "practices"],
  ["anal", "practices"],
];

const d = (over: Record<string, Partial<ApiDesire>> = {}): ApiDesire[] =>
  CATALOG.map(([code, category]) => ({
    code,
    category,
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
      missionary: { done: true },
      anal: { against: true, limit: true },
      fellatio: { limit: true },
    }),
  },
};

export const Suggestif: Story = {
  args: { explicit: false, items: d() },
};
