import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { MediaLightbox } from "./MediaLightbox";
import { Button } from "../Button/Button";
import type { BlogPostMedia } from "../BlogPost/BlogPost";

const PHOTO =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=70";
const PHOTO2 =
  "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=1200&q=70";
const LANDSCAPE =
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1600&q=70";

const meta = {
  title: "Blog/MediaLightbox",
  component: MediaLightbox,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Visionnage plein écran, ouvert depuis le bouton « agrandir » de `SafeMedia`. L'ouverture ne révèle rien : il faut tenir sur le média, comme sur la vignette — le geste n'est jamais court-circuité.",
      },
    },
  },
  args: { open: true, index: 0, onIndexChange: fn(), onClose: fn() },
} satisfies Meta<typeof MediaLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnSeulMedia: Story = {
  name: "Un seul média",
  args: { media: [{ src: PHOTO, alt: "Photo" }] },
};

export const RatioPaysage: Story = {
  name: "Média paysage (letterbox)",
  args: { media: [{ src: LANDSCAPE, alt: "Photo paysage" }] },
  parameters: {
    docs: {
      description: {
        story:
          "`object-contain` : le média entier reste visible, letterboxé, jamais recadré ni pivoté automatiquement.",
      },
    },
  },
};

export const Carrousel: Story = {
  name: "Plusieurs médias (navigation)",
  args: { media: [] },
  render: () => {
    const media: BlogPostMedia[] = [
      { src: PHOTO, alt: "Photo 1" },
      { src: PHOTO2, alt: "Photo 2" },
      { src: LANDSCAPE, alt: "Photo 3" },
    ];
    const [open, setOpen] = useState(true);
    const [index, setIndex] = useState(0);
    return (
      <div className="flex h-dvh items-center justify-center bg-charcoal-900">
        <Button onClick={() => setOpen(true)}>Rouvrir</Button>
        <MediaLightbox
          open={open}
          media={media}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setOpen(false)}
        />
      </div>
    );
  },
};
