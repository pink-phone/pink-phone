import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { useState } from "react";
import { PostComposer } from "./PostComposer";
import { Sheet } from "../Sheet/Sheet";

const meta = {
  title: "Blog/PostComposer",
  component: PostComposer,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standalone: Story = {
  render: (args) => (
    <div className="w-80">
      <PostComposer {...args} />
    </div>
  ),
};

export const DansUneSheet: Story = {
  name: "Dans une Sheet (contexte réel)",
  render: (args) => {
    const [open, setOpen] = useState(true);
    return (
      <div className="h-dvh">
        <Sheet open={open} title="Écrire" onClose={() => setOpen(false)}>
          <PostComposer
            {...args}
            onSubmit={(d) => {
              args.onSubmit(d);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </Sheet>
      </div>
    );
  },
};
