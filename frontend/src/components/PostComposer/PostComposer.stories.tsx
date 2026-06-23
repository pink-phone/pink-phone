import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { PostComposer } from "./PostComposer";
import { Sheet } from "../Sheet/Sheet";

const meta = {
  title: "Blog/PostComposer",
  component: PostComposer,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standalone: Story = {
  render: (args) => (
    <div className="w-80">
      <PostComposer {...args} />
    </div>
  ),
};

/** Édition d'un brouillon : champs pré-remplis, photo ajoutable. */
export const Édition: Story = {
  args: {
    initial: {
      title: "Note pour plus tard…",
      body: "Une idée que je garde au chaud, je la peaufine avant de te l'envoyer.",
    },
  },
  render: (args) => (
    <div className="w-80">
      <PostComposer {...args} />
    </div>
  ),
};

const DEMO_PHOTO =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=70";

/**
 * Édition avec photo normale jointe : aperçu (révélé au press-hold), remplaçable.
 * Le toggle « Téléchargeable » (#78) apparaît (média non éphémère), ici activé.
 */
export const ÉditionAvecPhoto: Story = {
  args: {
    defaultAllowDownload: true,
    initial: {
      title: "Note pour plus tard…",
      body: "Une idée que je garde au chaud, je la peaufine avant de te l'envoyer.",
      media: { viewOnce: false, loader: () => Promise.resolve(DEMO_PHOTO) },
    },
  },
  render: (args) => (
    <div className="w-80">
      <PostComposer {...args} />
    </div>
  ),
};

/** Édition avec photo éphémère jointe : pas d'aperçu (consommé), seulement retirer. */
export const ÉditionPhotoÉphémère: Story = {
  args: {
    initial: {
      title: "Note pour plus tard…",
      body: "Une idée que je garde au chaud, je la peaufine avant de te l'envoyer.",
      media: { viewOnce: true },
    },
  },
  render: (args) => (
    <div className="w-80">
      <PostComposer {...args} />
    </div>
  ),
};

export const DansUneSheet: Story = {
  name: "Dans une Sheet (contexte réel)",
  render: (args) => {
    const [open, setOpen] = useState(true);
    return (
      <div className="h-dvh">
        <Sheet open={open} title="Écrire" onClose={() => setOpen(false)}>
          <PostComposer
            {...args}
            onSubmit={(d) => {
              args.onSubmit(d);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </Sheet>
      </div>
    );
  },
};
