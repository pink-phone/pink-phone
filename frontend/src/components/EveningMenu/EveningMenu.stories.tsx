import type { Meta, StoryObj } from "@storybook/react-vite";
import { EveningMenu } from "./EveningMenu";
import type { ApiEveningMenuItem } from "../../api/types";

const CODES = [
  "cuddle",
  "movie",
  "candlelight",
  "bath",
  "massage",
  "slowDance",
  "game",
  "roleplay",
  "newThing",
  "passionate",
];

const items = (
  over: Record<string, Partial<ApiEveningMenuItem>> = {},
): ApiEveningMenuItem[] =>
  CODES.map((code) => ({ code, picked: false, matched: false, ...over[code] }));

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
          "Menu du soir (#97b) : on coche en secret ce qui tente pour ce soir ; un item matché (les deux l'ont coché aujourd'hui) s'illumine. Rituel quotidien.",
      },
    },
  },
  argTypes: { onToggle: { action: "toggle" } },
} satisfies Meta<typeof EveningMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  args: { items: items() },
};

/** Quelques choix de mon côté (pas encore matchés). */
export const MesChoix: Story = {
  args: {
    items: items({ massage: { picked: true }, movie: { picked: true } }),
  },
};

/** Un match du soir (les deux veulent un massage). */
export const AvecMatch: Story = {
  args: {
    items: items({
      massage: { picked: true, matched: true },
      cuddle: { picked: true },
    }),
  },
};
