import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { VerdictPicker, type Verdict } from "./VerdictPicker";

const meta = {
  title: "Blog/VerdictPicker",
  component: VerdictPicker,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "« Chaud·e / Curieux·se / Pas mon truc » : se positionner sur un fantasme sans devoir l'écrire.",
      },
    },
  },
  argTypes: { onChange: { action: "verdict" } },
} satisfies Meta<typeof VerdictPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParDéfaut: Story = { args: { value: "curious" } };

export const Interactif: Story = {
  render: (args) => {
    const [value, setValue] = useState<Verdict | null>(null);
    return (
      <div className="w-80">
        <VerdictPicker
          {...args}
          value={value}
          onChange={(v) => {
            setValue(v);
            args.onChange?.(v);
          }}
        />
      </div>
    );
  },
};
