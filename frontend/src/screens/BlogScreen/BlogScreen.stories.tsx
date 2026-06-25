import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlogScreen } from "./BlogScreen";
import {
  CommentsSheet,
  type CommentView,
} from "../../components/CommentsSheet/CommentsSheet";
import { SAMPLE_POSTS } from "../../mock/data";

const SAMPLE_COMMENTS: CommentView[] = [
  {
    id: "1",
    authorName: "Camille",
    body: "Tell me more… I'm intrigued. 😏",
    timeLabel: "Yesterday, 11pm",
  },
  {
    id: "2",
    authorName: "You",
    body: "Soon. I want to get it just right first.",
    timeLabel: "Yesterday, 11:20pm",
  },
  {
    id: "3",
    authorName: "Camille",
    body: "I love it when you take your time.",
    timeLabel: "Just now",
  },
];

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

export const AvecCommentaires: Story = {
  name: "Avec commentaires ouverts",
  render: (args) => (
    <div className="w-[380px]">
      <BlogScreen {...args} />
      <CommentsSheet
        open
        comments={SAMPLE_COMMENTS}
        onClose={() => {}}
        onAdd={() => {}}
      />
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

export const AvecPagination: Story = {
  name: "Avec « voir plus »",
  args: { hasMore: true },
  render: (args) => (
    <div className="w-[380px]">
      <BlogScreen {...args} />
    </div>
  ),
};

export const AvecNonLus: Story = {
  name: "Avec ligne « non lus »",
  args: {
    // Les non-lus sont en haut du fil ; la ligne se pose sous le dernier.
    posts: SAMPLE_POSTS.map((p, i) => ({ ...p, unread: i < 2 })),
  },
  render: (args) => (
    <div className="w-[380px]">
      <BlogScreen {...args} />
    </div>
  ),
};

/**
 * Brouillons (#91) : regroupés dans une section repliable en tête (repliée par
 * défaut). Ici plusieurs brouillons pour montrer le compteur et le dépli.
 */
export const AvecBrouillons: Story = {
  name: "Avec brouillons repliables",
  args: {
    posts: [
      { ...SAMPLE_POSTS[0], id: "d1", draft: true, isMine: true },
      { ...SAMPLE_POSTS[0], id: "d2", draft: true, isMine: true, title: "Autre idée…" },
      ...SAMPLE_POSTS.filter((p) => !p.draft),
    ],
  },
  render: (args) => (
    <div className="w-[380px]">
      <BlogScreen {...args} />
    </div>
  ),
};
