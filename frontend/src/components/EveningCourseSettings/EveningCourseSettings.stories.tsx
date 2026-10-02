import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { EveningCourseSettings, defaultEntries, type CourseCategory } from "./EveningCourseSettings";

const CATEGORIES: CourseCategory[] = [
  { id: "tender", label: "Tendre & complice", defaultCourses: ["starter"] },
  { id: "games", label: "Jeux & scénarios", defaultCourses: ["starter", "main"] },
  { id: "positions", label: "Positions", defaultCourses: ["main"] },
  { id: "sensations", label: "Sensations", defaultCourses: ["main"] },
  { id: "power", label: "Pouvoir & rôles", defaultCourses: ["main"] },
  { id: "practices", label: "Pratiques", defaultCourses: ["dessert"] },
  { id: "places", label: "Lieux & frissons", defaultCourses: [] },
];

const meta = {
  title: "Envies/EveningCourseSettings",
  component: EveningCourseSettings,
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
          "Réglage par salon : pour chaque service du menu du soir (Entrée/Plat/Dessert), les catégories qui l'alimentent — sélection multiple, une catégorie peut nourrir plusieurs services. Tant que le salon n'a rien changé, c'est le classement du catalogue ; « • » marque le classement d'origine une fois personnalisé.",
      },
    },
  },
  args: {
    categories: CATEGORIES,
    custom: false,
    entries: [],
    onChange: () => {},
    onReset: () => {},
  },
} satisfies Meta<typeof EveningCourseSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};

/** Personnalisé : « Tendre » nourrit Entrée et Dessert, « Lieux » le Plat ; « Pratiques » n'alimente plus rien. */
export const Personnalisé: Story = {
  args: {
    custom: true,
    entries: [
      "starter:tender",
      "dessert:tender",
      "main:games",
      "main:positions",
      "main:places",
    ],
  },
};

/** Interactif : coche/décoche, rétablir. */
export const Interactif: Story = {
  render: (args) => {
    const [custom, setCustom] = useState(false);
    const [entries, setEntries] = useState<string[]>(defaultEntries(CATEGORIES));
    return (
      <EveningCourseSettings
        {...args}
        custom={custom}
        entries={entries}
        onChange={(e) => {
          setCustom(true);
          setEntries(e);
        }}
        onReset={() => {
          setCustom(false);
          setEntries(defaultEntries(CATEGORIES));
        }}
      />
    );
  },
};
