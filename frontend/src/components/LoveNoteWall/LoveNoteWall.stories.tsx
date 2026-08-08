import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoveNoteWall } from "./LoveNoteWall";
import type { ApiLoveNote } from "../../api/types";

const note = (over: Partial<ApiLoveNote> & { id: string }): ApiLoveNote => ({
  authorId: "u2",
  authorName: "Camille",
  body: "Je pense à toi 🌸",
  sealed: false,
  openAt: null,
  createdAt: "2026-06-29T20:00:00.000Z",
  ...over,
});

const meta = {
  title: "MotsDoux/LoveNoteWall",
  component: LoveNoteWall,
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
          "Mur de mots doux (#102) : composer (avec ouverture différée optionnelle) + post-it. Les mots scellés s'affichent en teaser cadenassé.",
      },
    },
  },
  argTypes: { onSend: { action: "envoyer" }, onDelete: { action: "supprimer" } },
  args: { userId: "u1", onSend: () => true },
} satisfies Meta<typeof LoveNoteWall>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vide: Story = {
  args: { notes: [] },
};

export const AvecMots: Story = {
  args: {
    notes: [
      note({ id: "n1", authorId: "u1", authorName: "Toi", body: "Hâte de te voir ce soir." }),
      note({ id: "n2", body: "Tu me manques déjà." }),
      note({
        id: "n3",
        body: null,
        sealed: true,
        openAt: "2099-12-25T08:00:00.000Z",
      }),
    ],
  },
};
