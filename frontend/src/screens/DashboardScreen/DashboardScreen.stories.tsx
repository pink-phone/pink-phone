import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  DashboardScreen,
  type DashboardPartner,
} from "./DashboardScreen";
import { SPACE_NAME } from "../../mock/data";
import type { ApiLoveNote } from "../../api/types";

const CAMILLE: DashboardPartner = {
  id: "p1",
  name: "Camille",
  glyph: "C",
  mood: "flirty",
  timeLabel: "il y a 10 min",
};

const NOTE = (over: Partial<ApiLoveNote> & { id: string }): ApiLoveNote => ({
  authorId: "p1",
  authorName: "Camille",
  body: "Je pense à toi 🌸",
  sealed: false,
  openAt: null,
  createdAt: "2026-06-29T20:00:00.000Z",
  ...over,
});

const meta = {
  title: "Écrans/DashboardScreen",
  component: DashboardScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-[380px]">
        <Story />
      </div>
    ),
  ],
  args: {
    spaceName: SPACE_NAME,
    partners: [CAMILLE],
    myMood: null,
    userId: "me",
    onOpenMood: fn(),
  },
} satisfies Meta<typeof DashboardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {};

/** Mon humeur posée (carte « Toi » illuminée, tap pour changer). */
export const HumeurPosée: Story = {
  args: { myMood: "veryHot" },
};

/** Groupe (≥ 3 personnes, #52) : plusieurs cartes météo. */
export const Groupe: Story = {
  name: "Salon à plusieurs",
  args: {
    partners: [
      CAMILLE,
      { id: "p2", name: "Alex", glyph: "A", mood: "calm", timeLabel: "il y a 1 h" },
      { id: "p3", name: "Sam", glyph: "S", mood: null },
    ],
    myMood: "veryHot",
  },
};

export const Mystère: Story = {
  name: "Humeur à l'aveugle (partenaire masqué)",
  args: { partners: [{ ...CAMILLE, moodHidden: true }], myMood: null },
};

/** Les rituels (Menu du soir + Vos envies) + le mur de mots doux. */
export const Rituels: Story = {
  args: {
    eveningMenuEnabled: true,
    onOpenEveningMenu: fn(),
    desiresEnabled: true,
    onOpenDesires: fn(),
    onComposeLoveNote: fn(),
    loveNotes: [
      NOTE({ id: "n1", authorId: "me", authorName: "Toi", body: "Hâte de te voir." }),
      NOTE({ id: "n2", body: "Tu me manques déjà." }),
    ],
  },
};

/** Match du soir révélé : l'entrée « Menu du soir » se transforme (braise + badge). */
export const MatchDuSoir: Story = {
  args: {
    eveningMenuEnabled: true,
    eveningMenuMatches: 1,
    onOpenEveningMenu: fn(),
  },
};

export const Nouveautés: Story = {
  name: "Du nouveau (posts, commentaires, défis)",
  args: { newPosts: 1, newComments: 2, newChallenges: 1 },
};

export const Notices: Story = {
  name: "Notices de salon (#84/#85)",
  args: {
    notices: [
      { id: "1", kind: "member_joined", actorName: "Camille" },
      { id: "2", kind: "download_enabled", actorName: "Alex" },
    ],
  },
};

export const Solo: Story = {
  name: "Espace en attente (sans partenaire)",
  args: {
    partners: [],
    inviteCode: "EmberVelvet#7",
    onCreateInvite: () => {},
  },
};
