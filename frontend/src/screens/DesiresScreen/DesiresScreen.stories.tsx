import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesiresScreen } from "./DesiresScreen";
import type { ApiDesire } from "../../api/types";

// Un échantillon du catalogue catégorisé (#99).
const CATALOG: Array<[string, string]> = [
  ["morningCuddle", "tender"],
  ["oilMassage", "tender"],
  ["bathTogether", "tender"],
  ["roleplay", "games"],
  ["truthOrDare", "games"],
  ["kamaPosition", "kamasutra"],
  ["mirror", "kamasutra"],
  ["blindfold", "sensations"],
  ["spanking", "sensations"],
  ["gentleDomination", "power"],
  ["outdoors", "places"],
  ["hotel", "places"],
];

const items = (
  over: Record<string, Partial<ApiDesire>> = {},
): ApiDesire[] =>
  CATALOG.map(([code, category]) => ({
    code,
    category,
    interested: false,
    matched: false,
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
          "Bucket list (#99) : envies par catégorie (sections repliables). Coche secrète → match ; « ✓ Réalisé » au niveau du couple.",
      },
    },
  },
  argTypes: {
    onToggle: { action: "intérêt" },
    onToggleDone: { action: "réalisé" },
    onBack: { action: "back" },
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

/** Sections repliées par défaut (badges match/réalisé sur les en-têtes). */
export const ParDéfaut: Story = {
  args: {
    items: items({
      oilMassage: { interested: true, matched: true },
      bathTogether: { done: true },
      roleplay: { interested: true },
    }),
  },
};
