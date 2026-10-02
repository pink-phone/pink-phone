import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CourseTabs, type Course, type CourseStatus } from "./CourseTabs";

const meta = {
  title: "Envies/CourseTabs",
  component: CourseTabs,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Barre à 3 segments du menu du soir (#97b, #0039) : Entrée/Plat/Dessert, toujours tous accessibles, chacun affichant son propre statut ce soir.",
      },
    },
  },
  args: {
    active: "starter",
    statuses: { starter: "neutral", main: "neutral", dessert: "neutral" },
    onChange: () => {},
  },
} satisfies Meta<typeof CourseTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive(props: { statuses: Record<Course, CourseStatus> }) {
  const [active, setActive] = useState<Course>("starter");
  return (
    <CourseTabs active={active} statuses={props.statuses} onChange={setActive} />
  );
}

export const Neutre: Story = {
  render: () => (
    <Interactive statuses={{ starter: "neutral", main: "neutral", dessert: "neutral" }} />
  ),
};

export const Mixte: Story = {
  name: "Statuts mixtes",
  render: () => (
    <Interactive statuses={{ starter: "matched", main: "picked", dessert: "neutral" }} />
  ),
};

export const MenuComplet: Story = {
  name: "Menu complet (3 matchs)",
  render: () => (
    <Interactive statuses={{ starter: "matched", main: "matched", dessert: "matched" }} />
  ),
};
