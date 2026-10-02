import type { Meta, StoryObj } from "@storybook/react-vite";
import { EveningMenuPicker } from "./EveningMenuPicker";
import type { ApiEveningMenuItem } from "../../api/types";

const base = {
  category: "evening",
  categoryLabelFr: "Menu du soir",
  categoryLabelEn: "Tonight's menu",
  subcategory: null,
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
} as const;

const SMALL: [string, string][] = [
  ["evening-cuddle", "Câlins sous la couette"],
  ["evening-movie", "Un film, blotti·e·s"],
  ["evening-candlelight", "Dîner aux chandelles"],
  ["evening-bath", "Un bain à deux"],
  ["evening-massage", "Un massage"],
];
const small = (picked: string[] = []): ApiEveningMenuItem[] =>
  SMALL.map(([code, label]) => ({
    ...base,
    code,
    labelFr: label,
    labelEn: label,
    picked: picked.includes(code),
  }));

// Simule le service « Plat » (~99 items en vrai) : au-delà du seuil de
// densité, recherche + regroupement par sous-catégorie apparaissent.
const KAMASUTRA_SAMPLE = [
  ["kamasutra-missionary", "Missionnaire", "Face à face, la classique tendre."],
  ["kamasutra-lotus", "Le lotus", "Assis sur les cuisses de l'autre, front contre front."],
  ["kamasutra-doggy-style", "Levrette", "À quatre pattes, l'autre derrière."],
  ["kamasutra-bridge", "Le pont", "L'un en appui sur les mains, cambré."],
  ["kamasutra-butterfly", "Le papillon", "Allongé au bord du lit, ouvert et offert."],
] as const;
const MODERN_SAMPLE = [
  ["modern-cat", "Le CAT (alignement coïtal)", "Une variante du missionnaire, plus haute."],
  ["modern-office-chair", "La chaise de bureau", "Assis sur une chaise qui pivote."],
  ["modern-sex-swing", "La balançoire suspendue", "Un harnais qui porte tout le poids."],
] as const;
const denseItems = (): ApiEveningMenuItem[] => {
  const rows: ApiEveningMenuItem[] = [];
  for (let i = 0; i < 6; i++) {
    for (const [code, label, description] of KAMASUTRA_SAMPLE) {
      rows.push({
        code: `${code}-${i}`,
        category: "positions",
        categoryLabelFr: "Positions",
        categoryLabelEn: "Positions",
        subcategory: "kamasutra",
        labelFr: label,
        labelEn: label,
        labelFrSoft: null,
        labelEnSoft: null,
        descriptionFr: description,
        descriptionEn: description,
        intensity: "hot",
        course: "main",
        picked: false,
        matched: false,
        partnerWants: false,
        refused: false,
      });
    }
  }
  for (const [code, label, description] of MODERN_SAMPLE) {
    rows.push({
      code,
      category: "positions",
      categoryLabelFr: "Positions",
      categoryLabelEn: "Positions",
      subcategory: "modern",
      labelFr: label,
      labelEn: label,
      labelFrSoft: null,
      labelEnSoft: null,
      descriptionFr: description,
      descriptionEn: description,
      intensity: "hot",
      course: "main",
      picked: false,
      matched: false,
      partnerWants: false,
      refused: false,
    });
  }
  return rows;
};

const meta = {
  title: "Envies/EveningMenuPicker",
  component: EveningMenuPicker,
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
          "Écran de recherche / sélection multiple d'un service du menu du soir (refacto 114d). Brouillon local : « Valider » renvoie la sélection finale, « Annuler » la jette. Marque de sélection = coche (pas un cœur).",
      },
    },
  },
  args: { course: "main", onConfirm: () => {}, onCancel: () => {} },
  argTypes: { onConfirm: { action: "valider" }, onCancel: { action: "annuler" } },
} satisfies Meta<typeof EveningMenuPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = { args: { items: small() } };

export const AvecSélectionExistante: Story = {
  args: { items: small(["evening-massage", "evening-bath"]) },
};

/** Gros service (« Plat ») : groupes repliés par sous-catégorie ; la recherche aplatit. */
export const ServiceDense: Story = { args: { items: denseItems() } };

/** « Tout le catalogue » : piocher hors des catégories du service (ex. un lieu). */
export const HorsCatégorie: Story = {
  args: {
    items: [
      ...small(),
      {
        ...base,
        code: "places-cinema",
        category: "places",
        categoryLabelFr: "Lieux",
        categoryLabelEn: "Places",
        labelFr: "Au cinéma, dans la dernière rangée",
        labelEn: "At the cinema, back row",
        course: "",
      },
    ].map((i) => ({ ...i, course: i.course === "" ? "" : "main" })) as ApiEveningMenuItem[],
  },
};
