import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { ReactionSettings } from "./ReactionSettings";
import type { ReactionId } from "../ReactionBar/ReactionBar";

const meta = {
  title: "Réglages/ReactionSettings",
  component: ReactionSettings,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    value: ["heart", "fire", "smirk", "breath", "hush"],
    allowCustom: true,
    onChange: fn(),
  },
} satisfies Meta<typeof ReactionSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactif: Story = {
  render: () => {
    const [value, setValue] = useState<ReactionId[]>([
      "heart",
      "fire",
      "smirk",
      "breath",
      "hush",
    ]);
    const [allowCustom, setAllowCustom] = useState(true);
    return (
      <div className="w-80">
        <ReactionSettings
          value={value}
          allowCustom={allowCustom}
          onChange={(r, c) => {
            setValue(r);
            setAllowCustom(c);
          }}
        />
      </div>
    );
  },
};
