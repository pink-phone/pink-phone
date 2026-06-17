import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlogScreen } from "./BlogScreen";
import { SAMPLE_POSTS } from "../../mock/data";

const meta = {
  title: "Écrans/BlogScreen",
  component: BlogScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    onCompose: { action: "écrire" },
    onToggleReaction: { action: "réaction" },
    onOpenComments: { action: "commentaires" },
  },
  args: { posts: SAMPLE_POSTS },
} satisfies Meta<typeof BlogScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  render: (args) => (
    <div className="w-[380px]">
      <BlogScreen {...args} />
    </div>
  ),
};

export const Vide: Story = {
  args: { posts: [] },
  render: (args) => (
    <div className="w-[380px]">
      <BlogScreen {...args} />
    </div>
  ),
};
