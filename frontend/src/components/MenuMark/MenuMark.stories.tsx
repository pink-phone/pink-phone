import type { Meta, StoryObj } from "@storybook/react-vite";
import { MenuMark, type MenuMarkState } from "./MenuMark";

const STATES: MenuMarkState[] = ["empty", "mine", "proposed", "match", "refused"];

const meta = {
  title: "Envies/MenuMark",
  component: MenuMark,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Marque d'état d'un item du menu du soir : vide · choisi par moi (✓) · proposé par l'autre (＋ pointillé) · match (✨) · refusé (⊘).",
      },
    },
  },
  args: { state: "mine" },
} satisfies Meta<typeof MenuMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mine: Story = {};

export const TousLesÉtats: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-xs text-taupe-300">
      {STATES.map((s) => (
        <div key={s} className="flex flex-col items-center gap-1">
          <MenuMark state={s} />
          {s}
        </div>
      ))}
    </div>
  ),
};
