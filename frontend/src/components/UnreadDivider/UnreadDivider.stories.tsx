import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnreadDivider } from "./UnreadDivider";

const meta = {
  title: "Communs/UnreadDivider",
  component: UnreadDivider,
  tags: ["autodocs"],
  args: { label: "Unread" },
} satisfies Meta<typeof UnreadDivider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const Card = ({ dim, children }: { dim?: boolean; children: string }) => (
  <div
    className={`rounded-2xl bg-charcoal-700 p-4 text-sm ${
      dim ? "text-taupe-400" : "text-taupe-100"
    }`}
  >
    {children}
  </div>
);

export const InAFeed: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Card>Fresh confession</Card>
      <Card>Another new one</Card>
      <UnreadDivider {...args} />
      <Card dim>Already seen</Card>
      <Card dim>Older, already seen</Card>
    </div>
  ),
};
