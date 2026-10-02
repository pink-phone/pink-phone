import type { Meta, StoryObj } from "@storybook/react-vite";
import { EveningMenuScreen } from "./EveningMenuScreen";
import type { ApiEveningMenuItem } from "../../api/types";

type Course = ApiEveningMenuItem["course"];

const base = (
  code: string,
  label: string,
  course: Course,
  over: Partial<ApiEveningMenuItem> = {},
): ApiEveningMenuItem => ({
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
  course,
  picked: false,
  matched: false,
  partnerWants: false,
  refused: false,
  ...over,
});

const STARTER: [string, string][] = [
  ["evening-cuddle", "Câlins sous la couette"],
  ["evening-movie", "Un film, blotti·e·s"],
  ["evening-candlelight", "Dîner aux chandelles"],
  ["evening-bath", "Un bain à deux"],
  ["evening-massage", "Un massage"],
  ["evening-slowDance", "Un slow tous les deux"],
];
const DESSERT: [string, string][] = [
  ["evening-newThing", "Tenter une nouveauté"],
  ["evening-passionate", "Une nuit passionnée"],
];
// Le vrai « Plat » compte ~99 items (Kamasutra + modernes + sensations/pouvoir,
// #0039) : on simule le volume pour vérifier que le premier rendu reste court
// (groupes repliés) malgré la densité.
const MAIN_SAMPLE: [string, string][] = [
  ["kamasutra-missionary", "Missionnaire"],
  ["kamasutra-lotus", "Le lotus"],
  ["kamasutra-doggy-style", "Levrette"],
  ["kamasutra-bridge", "Le pont"],
  ["kamasutra-butterfly", "Le papillon"],
  ["kamasutra-scissors", "Les ciseaux"],
];

function buildItems(overMain: Record<string, Partial<ApiEveningMenuItem>> = {}) {
  const items: ApiEveningMenuItem[] = [
    ...STARTER.map(([code, label]) => base(code, label, "starter")),
    ...DESSERT.map(([code, label]) => base(code, label, "dessert")),
  ];
  for (let i = 0; i < 16; i++) {
    for (const [code, label] of MAIN_SAMPLE) {
      const fullCode = `${code}-${i}`;
      items.push(
        base(fullCode, label, "main", {
          category: "positions",
          categoryLabelFr: "Positions",
          categoryLabelEn: "Positions",
          subcategory: "kamasutra",
          descriptionFr: "Front contre front, tout en lenteur.",
          descriptionEn: "Forehead to forehead, all slowness.",
          intensity: "hot",
          ...overMain[fullCode],
        }),
      );
    }
  }
  items.push(
    base("modern-office-chair", "La chaise de bureau", "main", {
      category: "positions",
      categoryLabelFr: "Positions",
      categoryLabelEn: "Positions",
      subcategory: "modern",
      descriptionFr: "Assis sur une chaise qui pivote.",
      descriptionEn: "Seated on a swivel chair.",
      intensity: "hot",
    }),
  );
  return items;
}

const meta = {
  title: "Écrans/EveningMenuScreen",
  component: EveningMenuScreen,
  parameters: { layout: "fullscreen" },
  argTypes: {
    onToggle: { action: "toggle" },
    onRefuse: { action: "refuser" },
    onBack: { action: "back" },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto min-h-dvh max-w-md bg-charcoal-900 bg-felt-velvet px-4 py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EveningMenuScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Volume réaliste (#0039) : Entrée/Dessert en pilules, Plat dense (recherche
 *  + groupes repliés). Onglet Entrée par défaut. */
export const ParDéfaut: Story = {
  args: { items: buildItems() },
};

export const AvecMatch: Story = {
  args: {
    items: buildItems({
      "kamasutra-missionary-0": { picked: true, matched: true },
    }),
  },
};

/** Mode ouvert (#0040) : le/la partenaire propose « câlins » ce soir, visible
 *  tout de suite (à valider ou refuser). */
export const ModeOuvert: Story = {
  name: "Mode ouvert : proposition en Entrée",
  args: {
    onRefuse: () => {},
    items: buildItems().map((i) =>
      i.code === "evening-cuddle"
        ? { ...i, partnerWants: true, matched: true }
        : i,
    ),
  },
};

/** Les 3 services matchés ce soir : le bandeau d'onglets s'illumine. */
export const MenuComplet: Story = {
  name: "Menu complet (3 services matchés)",
  args: {
    items: buildItems({ "kamasutra-missionary-0": { picked: true, matched: true } }).map(
      (i) =>
        i.course !== "main" ? { ...i, picked: true, matched: true } : i,
    ),
  },
};
