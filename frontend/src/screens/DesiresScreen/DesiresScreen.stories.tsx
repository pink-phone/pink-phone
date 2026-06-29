import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesiresScreen } from "./DesiresScreen";
import type { ApiDesire } from "../../api/types";

const CODES = [
  "massage",
  "roleplay",
  "blindfold",
  "newPlace",
  "shower",
  "slowHands",
];

const items = (over: Record<string, Partial<ApiDesire>> = {}): ApiDesire[] =>
  CODES.map((code) => ({
    code,
    interested: false,
    matched: false,
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
          "Écran « Vos envies » (#99) : on coche en secret, une envie ne se révèle qu'en cas de réciprocité (match).",
      },
    },
  },
  argTypes: { onToggle: { action: "toggle" }, onBack: { action: "back" } },
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

export const ParDéfaut: Story = {
  args: { items: items() },
};

/** Quelques envies cochées par moi (pas encore matchées). */
export const MesEnvies: Story = {
  args: {
    items: items({ massage: { interested: true }, shower: { interested: true } }),
  },
};

/** Un match en tête (les deux veulent un massage). */
export const AvecMatch: Story = {
  args: {
    items: items({
      massage: { interested: true, matched: true },
      roleplay: { interested: true },
    }),
  },
};
