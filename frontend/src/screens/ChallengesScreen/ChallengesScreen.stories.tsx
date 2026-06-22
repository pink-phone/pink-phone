import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChallengesScreen } from "./ChallengesScreen";
import { SAMPLE_CHALLENGES } from "../../mock/data";

const meta = {
  title: "Écrans/ChallengesScreen",
  component: ChallengesScreen,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    onNew: { action: "nouveau" },
    onAccept: { action: "accept" },
    onNegotiate: { action: "negotiate" },
    onComplete: { action: "complete" },
  },
  args: { challenges: SAMPLE_CHALLENGES },
} satisfies Meta<typeof ChallengesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  render: (args) => (
    <div className="w-[380px]">
      <ChallengesScreen {...args} />
    </div>
  ),
};

export const AvecPagination: Story = {
  name: "Avec « voir plus »",
  args: { hasMore: true },
  render: (args) => (
    <div className="w-[380px]">
      <ChallengesScreen {...args} />
    </div>
  ),
};
