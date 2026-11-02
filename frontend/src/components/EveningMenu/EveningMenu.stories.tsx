import type { Meta, StoryObj } from "@storybook/react-vite";
import { EveningMenu } from "./EveningMenu";
import type { ApiEveningMenuItem } from "../../api/types";

const LABELS: Record<string, string> = {
  "evening-cuddle": "Câlins sous la couette",
  "evening-movie": "Un film, blotti·e·s",
  "evening-candlelight": "Dîner aux chandelles",
  "evening-bath": "Un bain à deux",
  "evening-massage": "Un massage",
  "evening-slowDance": "Un slow tous les deux",
  "evening-game": "Un jeu un peu coquin",
  "evening-roleplay": "Un jeu de rôle",
  "evening-newThing": "Tenter une nouveauté",
  "evening-passionate": "Une nuit passionnée",
};

const items = (
  over: Record<string, Partial<ApiEveningMenuItem>> = {},
): ApiEveningMenuItem[] =>
  Object.entries(LABELS).map(([code, label]) => ({
    code,
    category: "evening",
    categoryLabelFr: "Menu du soir",
    categoryLabelEn: "Tonight's menu",
    subcategory: null,
    labelFr: label,
    labelEn: label,
    labelFrSoft: null,
    labelEnSoft: null,
    descriptionFr: null,
    descriptionEn: null,
    intensity: "soft",
    course: "starter",
    picked: false,
    matched: false,
    partnerWants: false,
    refused: false,
    ...over[code],
  }));

const meta = {
  title: "Envies/EveningMenu",
  component: EveningMenu,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Contenu d'UN service du menu du soir (#97b, #0039) : on coche en secret ce qui tente pour ce soir ; un item matché s'illumine. Le panneau liste la sélection du service ; « Ajouter » ouvre l'écran de recherche/sélection (refacto 114d).",
      },
    },
  },
  argTypes: { onToggle: { action: "toggle" }, onRefuse: { action: "refuser" }, onAdd: { action: "ajouter" } },
} satisfies Meta<typeof EveningMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  args: { items: items(), onAdd: () => {} },
};

/** Quelques choix de mon côté (pas encore matchés). */
export const MesChoix: Story = {
  args: {
    items: items({
      "evening-massage": { picked: true },
      "evening-movie": { picked: true },
    }),
  },
};

/** Un match du soir (les deux veulent un massage). */
export const AvecMatch: Story = {
  args: {
    items: items({
      "evening-massage": { picked: true, matched: true },
      "evening-cuddle": { picked: true },
    }),
  },
};

/** Mode ouvert (#0040) : le/la partenaire a déjà proposé « câlins » (visible
 *  tout de suite, déjà sur le menu) — bouton refuser en plus du toggle. Un
 *  autre item a été refusé (badge, plus de glow malgré mon envie). */
export const ModeOuvert: Story = {
  name: "Mode ouvert : proposition + refus",
  args: {
    onRefuse: () => {},
    items: items({
      "evening-cuddle": { partnerWants: true, matched: true },
      "evening-massage": { picked: true, refused: true },
    }),
  },
};

/** Registre suggestif : les libellés crus basculent sur leur variante douce. */
export const RegistreSuggestif: Story = {
  args: {
    explicit: false,
    items: items().map((i) =>
      i.code === "evening-passionate"
        ? { ...i, labelFrSoft: "Une nuit tout en douceur", labelEnSoft: "A gentle night" }
        : i,
    ),
  },
};
