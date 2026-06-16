import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { DashboardScreen } from "./DashboardScreen";
import type { MoodId } from "../../components/MoodSelector/moods";
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
    const [myMood, setMyMood] = useState<MoodId | null>(args.myMood);
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

export const Solo: Story = {
  name: "Espace en attente (sans partenaire)",
  args: { partner: undefined, partnerMood: undefined, inviteId: "a1b2c3d4-…" },
  render: (args) => (
    <div className="w-[380px]">
      <DashboardScreen {...args} />
    </div>
  ),
};
