import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { BottomNav, type TabId } from "./BottomNav";

const meta = {
  title: "Écrans/BottomNav",
  component: BottomNav,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { active: "dashboard", badges: { blog: 2 }, onChange: fn() },
} satisfies Meta<typeof BottomNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = {
  render: (args) => {
    const [active, setActive] = useState<TabId>("dashboard");
    return (
      <div className="mx-auto max-w-md">
        <BottomNav
          {...args}
          active={active}
          onChange={(t) => {
            setActive(t);
            args.onChange?.(t);
          }}
        />
      </div>
    );
  },
};
