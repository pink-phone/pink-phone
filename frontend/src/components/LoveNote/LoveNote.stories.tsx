import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoveNote } from "./LoveNote";

const meta = {
  title: "MotsDoux/LoveNote",
  component: LoveNote,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xs">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "padded" },
  argTypes: { onDelete: { action: "supprimer" } },
  args: {
    authorName: "Camille",
    body: "Je pense à toi, là, maintenant. 🌸",
    sealed: false,
    openAt: null,
  },
} satisfies Meta<typeof LoveNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lisible: Story = {};

/** Mon propre mot : croix de suppression. */
export const Mien: Story = {
  args: { authorName: "Toi", isMine: true },
};

/** Mot scellé (ouverture différée non échue) : teaser cadenassé. */
export const Scellé: Story = {
  args: {
    body: null,
    sealed: true,
    openAt: "2026-12-25T08:00:00.000Z",
  },
};

/** Mon mot programmé pour plus tard : je vois mon contenu + l'heure prévue. */
export const Programmé: Story = {
  args: {
    authorName: "Toi",
    isMine: true,
    body: "Joyeux anniversaire mon amour ❤️",
    openAt: "2099-01-01T09:00:00.000Z",
  },
};
