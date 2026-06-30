import type { Meta, StoryObj } from "@storybook/react-vite";
import { EveningMenuScreen } from "./EveningMenuScreen";
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
  title: "Écrans/EveningMenuScreen",
  component: EveningMenuScreen,
  parameters: { layout: "fullscreen" },
  argTypes: { onToggle: { action: "toggle" }, onBack: { action: "back" } },
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

export const ParDéfaut: Story = {
  args: { items: items() },
};

export const AvecMatch: Story = {
  args: {
    items: items({
      massage: { picked: true, matched: true },
      cuddle: { picked: true },
    }),
  },
};
