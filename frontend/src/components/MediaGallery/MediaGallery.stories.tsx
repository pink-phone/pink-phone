import type { Meta, StoryObj } from "@storybook/react-vite";
import { MediaGallery } from "./MediaGallery";

const PHOTO =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=640&q=70";
const PHOTO2 =
  "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=640&q=70";

const meta = {
  title: "Blog/MediaGallery",
  component: MediaGallery,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof MediaGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnSeulMedia: Story = {
  args: { media: [{ src: PHOTO, alt: "Photo" }] },
  render: (args) => (
    <div className="w-[360px]">
      <MediaGallery {...args} />
    </div>
  ),
};

export const Carrousel: Story = {
  name: "Plusieurs médias (carrousel)",
  args: {
    media: [
      { src: PHOTO, alt: "Photo 1" },
      { src: PHOTO2, alt: "Photo 2" },
      { src: PHOTO, alt: "Photo 3", downloadable: true },
    ],
  },
  render: (args) => (
    <div className="w-[360px]">
      <MediaGallery {...args} />
    </div>
  ),
};
