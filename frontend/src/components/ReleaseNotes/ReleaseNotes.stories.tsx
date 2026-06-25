import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReleaseNotes } from "./ReleaseNotes";
import { RELEASE_NOTES } from "../../releaseNotes";

const meta = {
  title: "Settings/ReleaseNotes",
  component: ReleaseNotes,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "« Quoi de neuf » (#90) : une entrée par version, datée et localisée, avec un badge sur la plus récente. Contenu bundlé, affiché dans les Réglages.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleaseNotes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Les vraies notes de version bundlées dans l'app. */
export const Defaut: Story = {
  args: { notes: RELEASE_NOTES },
};

/** Une seule version (premier lancement / app récente). */
export const UneSeule: Story = {
  args: { notes: RELEASE_NOTES.slice(0, 1) },
};

/** Aucune note (repli). */
export const Vide: Story = {
  args: { notes: [] },
};
