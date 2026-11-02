import type { Meta, StoryObj } from "@storybook/react-vite";
import { EveningMenuDone } from "./EveningMenuDone";

const meta = {
  title: "Envies/EveningMenuDone",
  component: EveningMenuDone,
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
          "« J'ai fini » du menu du soir en mode aveugle : on valide son menu ; quand tout le monde a fini, les choix de chacun sont dévoilés, matchés ou non.",
      },
    },
  },
  argTypes: { onDone: { action: "j'ai fini" }, onUndo: { action: "modifier" } },
  args: { meDone: false, revealed: false, partnerName: "Alex" },
} satisfies Meta<typeof EveningMenuDone>;

export default meta;
type Story = StoryObj<typeof meta>;

/** À valider. */
export const AValider: Story = {};

/** Validé : en attente de l'autre, on peut encore « Modifier ». */
export const EnAttente: Story = { args: { meDone: true } };

/** Tout le monde a fini : menus dévoilés (définitif pour ce soir). */
export const Dévoilé: Story = { args: { meDone: true, revealed: true } };
