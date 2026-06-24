import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import {
  DashboardScreen,
  type DashboardPartner,
} from "./DashboardScreen";
import { SPACE_NAME } from "../../mock/data";

const CAMILLE: DashboardPartner = {
  id: "p1",
  name: "Camille",
  glyph: "C",
  mood: "flirty",
  timeLabel: "il y a 10 min",
};

const meta = {
  title: "Écrans/DashboardScreen",
  component: DashboardScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    spaceName: SPACE_NAME,
    partners: [CAMILLE],
    myMood: null,
    onMoodChange: fn(),
  },
} satisfies Meta<typeof DashboardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  render: (args) => {
    const [myMood, setMyMood] = useState<string | null>(args.myMood);
    return (
      <div className="w-[380px]">
        <DashboardScreen
          {...args}
          myMood={myMood}
          onMoodChange={(m) => {
            setMyMood(m);
            args.onMoodChange?.(m);
          }}
        />
      </div>
    );
  },
};

/** Groupe (≥ 3 personnes, #52) : plusieurs cartes météo + formulation au pluriel. */
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
  render: (args) => (
    <div className="w-[380px]">
      <DashboardScreen {...args} />
    </div>
  ),
};

export const Mystère: Story = {
  name: "Humeur à l'aveugle (partenaire masqué)",
  args: {
    partners: [{ ...CAMILLE, moodHidden: true }],
    myMood: null,
  },
  render: (args) => {
    const [myMood, setMyMood] = useState<string | null>(args.myMood);
    return (
      <div className="w-[380px]">
        <DashboardScreen
          {...args}
          myMood={myMood}
          // Une fois mon humeur posée, la carte du partenaire se dévoile.
          partners={args.partners.map((p) => ({
            ...p,
            moodHidden: p.moodHidden && !myMood,
          }))}
          onMoodChange={(m) => {
            setMyMood(m);
            args.onMoodChange?.(m);
          }}
        />
      </div>
    );
  },
};

export const Nouveautés: Story = {
  name: "Du nouveau (posts, commentaires, défis)",
  args: { newPosts: 1, newComments: 2, newChallenges: 1 },
  render: (args) => (
    <div className="w-[380px]">
      <DashboardScreen {...args} />
    </div>
  ),
};

export const Notices: Story = {
  name: "Notices de salon (#84/#85)",
  args: {
    notices: [
      { id: "1", kind: "member_joined", actorName: "Camille" },
      { id: "2", kind: "download_enabled", actorName: "Alex" },
    ],
  },
  render: (args) => (
    <div className="w-[380px]">
      <DashboardScreen {...args} />
    </div>
  ),
};

export const Solo: Story = {
  name: "Espace en attente (sans partenaire)",
  args: {
    partners: [],
    inviteToken: "a1b2c3d4-1234-5678-9abc-def012345678",
    onCreateInvite: () => {},
  },
  render: (args) => (
    <div className="w-[380px]">
      <DashboardScreen {...args} />
    </div>
  ),
};
