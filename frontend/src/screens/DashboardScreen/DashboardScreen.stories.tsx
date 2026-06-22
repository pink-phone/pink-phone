import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { DashboardScreen } from "./DashboardScreen";
import { PARTNER, PARTNER_MOOD, SPACE_NAME } from "../../mock/data";

const meta = {
  title: "Écrans/DashboardScreen",
  component: DashboardScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    spaceName: SPACE_NAME,
    partner: PARTNER,
    partnerMood: PARTNER_MOOD,
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

export const Mystère: Story = {
  name: "Humeur à l'aveugle (partenaire masqué)",
  args: { partnerMoodHidden: true, myMood: null },
  render: (args) => {
    const [myMood, setMyMood] = useState<string | null>(args.myMood);
    return (
      <div className="w-[380px]">
        <DashboardScreen
          {...args}
          myMood={myMood}
          // Une fois mon humeur posée, la carte du partenaire se dévoile.
          partnerMoodHidden={args.partnerMoodHidden && !myMood}
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

export const Solo: Story = {
  name: "Espace en attente (sans partenaire)",
  args: {
    partner: undefined,
    partnerMood: undefined,
    inviteToken: "a1b2c3d4-1234-5678-9abc-def012345678",
    onCreateInvite: () => {},
  },
  render: (args) => (
    <div className="w-[380px]">
      <DashboardScreen {...args} />
    </div>
  ),
};
